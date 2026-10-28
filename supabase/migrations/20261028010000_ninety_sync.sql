-- Ninety (EOS) sync, phase 1: connect a group to Ninety and send its sprint work as To-Dos
-- (owner's choice, 2026-10-27; plan in docs/NINETY.md). One way: DevDock → Ninety.
--
-- Behind the ninety_sync feature flag: nothing is queued or sent for a group without it.
--
-- How it runs:
--   * A group owner/admin connects in Group settings → Ninety with a Ninety personal access token.
--     The ninety-sync Edge Function checks it with Ninety and keeps it in Supabase Vault; no client
--     can read it back.
--   * Each project (workspace) can be linked to one Ninety team (ninety_workspace_teams).
--   * Triggers put changed issues in ninety_outbox (from the app, Ask DevDock or GitHub alike).
--   * pg_cron runs private.ninety_kick() every minute: when the outbox has work it calls the
--     function (pg_net), which turns each issue into the To-Do it should be and remembers the
--     pair in ninety_links. A daily job queues the issues of sprints that start or end.
--
-- Which issues: assigned issues in the running sprint of a linked project. Done or Canceled, or out
-- of the sprint / unassigned / unlinked → the To-Do is completed. A deleted issue → deleted To-Do.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------------------- tables

-- One Ninety connection per group. The token is a Vault secret (token_secret_id), never a column a
-- client can read: clients see only the columns granted below.
create table public.ninety_connections (
  team_id           uuid primary key references public.teams (id) on delete cascade,
  token_secret_id   uuid not null,
  ninety_company_id text,
  -- The Ninety user who owns To-Dos whose assignee isn't in Ninety (matched to the person who
  -- connected, else Ninety's company owner).
  ninety_owner_id   text,
  ninety_owner_name text,
  token_hint        text not null,
  app_url           text not null check (app_url ~ '^https?://[^/]+$'),
  connected_by      uuid references auth.users (id) on delete set null,
  connected_at      timestamptz not null default now(),
  last_sync_at      timestamptz,
  last_error        text,
  last_error_at     timestamptz
);

-- Which Ninety team a project's To-Dos go to.
create table public.ninety_workspace_teams (
  workspace_id     uuid primary key,
  team_id          uuid not null references public.teams (id) on delete cascade,
  ninety_team_id   text not null check (char_length(ninety_team_id) between 1 and 64),
  ninety_team_name text not null check (char_length(ninety_team_name) between 1 and 200),
  updated_at       timestamptz not null default now(),
  foreign key (workspace_id, team_id) references public.workspaces (id, team_id) on delete cascade
);

-- Issue ↔ Ninety To-Do. No foreign key to issues: a deleted issue's To-Do still has to be deleted.
create table public.ninety_links (
  issue_id       uuid primary key,
  team_id        uuid not null references public.teams (id) on delete cascade,
  ninety_todo_id text not null,
  -- What was last sent (a hash of the To-Do's fields), so an unchanged issue costs no request.
  sent_hash      text not null,
  completed      boolean not null default false,
  synced_at      timestamptz not null default now()
);

create index ninety_links_team_idx on public.ninety_links (team_id);

-- Issues waiting to be sent. One row per issue however often it changes.
create table public.ninety_outbox (
  issue_id   uuid primary key,
  team_id    uuid not null references public.teams (id) on delete cascade,
  queued_at  timestamptz not null default now(),
  attempts   integer not null default 0,
  last_error text
);

create index ninety_outbox_team_idx on public.ninety_outbox (team_id, queued_at);

-- Where the function lives and the secret the cron call carries. One row, written by the function
-- itself on the first connect (it knows its own URL), so no project needs setting up by hand.
create table public.ninety_config (
  id             boolean primary key default true check (id),
  function_url   text,
  cron_secret_id uuid not null
);

create trigger set_updated_at before update on public.ninety_workspace_teams
  for each row execute function public.set_updated_at();

alter table public.ninety_connections enable row level security;
alter table public.ninety_workspace_teams enable row level security;
alter table public.ninety_links enable row level security;
alter table public.ninety_outbox enable row level security;
alter table public.ninety_config enable row level security;
revoke all on public.ninety_connections, public.ninety_workspace_teams, public.ninety_links,
  public.ninety_outbox, public.ninety_config from anon, authenticated;

-- Group owners/admins of a group with the flag see their connection (not the token) and the
-- project links. Everything else is the function's (service role) or goes through the RPCs below.
grant select (team_id, ninety_owner_name, token_hint, connected_at, last_sync_at, last_error, last_error_at)
  on public.ninety_connections to authenticated;
grant select on public.ninety_workspace_teams to authenticated;

create policy "Group admins see their Ninety connection" on public.ninety_connections
  for select to authenticated
  using (private.is_team_admin(team_id) and private.feature_enabled(team_id, 'ninety_sync'));
create policy "Group admins see their project links" on public.ninety_workspace_teams
  for select to authenticated
  using (private.is_team_admin(team_id) and private.feature_enabled(team_id, 'ninety_sync'));

-- The cron secret, made once here.
insert into public.ninety_config (cron_secret_id)
values (vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ninety_cron_secret', 'ninety-sync: cron → function'));

-- ---------------------------------------------------------------------------------------- queueing

-- Whether a group's changes should be queued at all.
create function private.ninety_active(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ninety_connections c where c.team_id = p_team)
     and private.feature_enabled(p_team, 'ninety_sync');
$$;

revoke execute on function private.ninety_active(uuid) from public, anon, authenticated;

create function private.ninety_queue(p_team uuid, p_issues uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ninety_outbox (issue_id, team_id)
  select i, p_team from unnest(p_issues) as i
  on conflict (issue_id) do update set queued_at = now(), attempts = 0, last_error = null;
$$;

revoke execute on function private.ninety_queue(uuid, uuid[]) from public, anon, authenticated;

create function private.ninety_queue_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_issue uuid;
begin
  -- IF on TG_OP: NEW isn't assigned in a delete trigger (nor OLD in an insert one).
  if tg_op = 'DELETE' then
    v_team := old.team_id; v_issue := old.id;
  else
    v_team := new.team_id; v_issue := new.id;
  end if;
  if private.ninety_active(v_team) then
    perform private.ninety_queue(v_team, array[v_issue]);
  end if;
  return null;
end;
$$;

revoke execute on function private.ninety_queue_issue() from public, anon, authenticated;

create trigger ninety_queue_insert after insert on public.issues
  for each row execute function private.ninety_queue_issue();
create trigger ninety_queue_update
  after update of title, status, assignee_id, due_date, cycle_id, workspace_id, number on public.issues
  for each row execute function private.ninety_queue_issue();
create trigger ninety_queue_delete after delete on public.issues
  for each row execute function private.ninety_queue_issue();

-- A sprint's dates or a project's key change what its issues' To-Dos should be.
create function private.ninety_queue_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  select w.team_id into v_team from public.workspaces w where w.id = new.workspace_id;
  if v_team is not null and private.ninety_active(v_team) then
    perform private.ninety_queue(v_team, array(select i.id from public.issues i where i.cycle_id = new.id));
  end if;
  return null;
end;
$$;

revoke execute on function private.ninety_queue_cycle() from public, anon, authenticated;

create trigger ninety_queue_cycle after update of starts_on, ends_on on public.issue_cycles
  for each row execute function private.ninety_queue_cycle();

create function private.ninety_queue_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.ninety_active(new.team_id) then
    perform private.ninety_queue(new.team_id, array(select i.id from public.issues i where i.workspace_id = new.id));
  end if;
  return null;
end;
$$;

revoke execute on function private.ninety_queue_workspace() from public, anon, authenticated;

create trigger ninety_queue_workspace after update of issue_key on public.workspaces
  for each row execute function private.ninety_queue_workspace();

-- Every issue of a group's linked projects that has, or could have, a To-Do.
create function private.ninety_queue_team(p_team uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(i.id) into v_ids
  from public.issues i
  where i.team_id = p_team
    and (i.workspace_id in (select l.workspace_id from public.ninety_workspace_teams l where l.team_id = p_team)
         or i.id in (select k.issue_id from public.ninety_links k where k.team_id = p_team));
  perform private.ninety_queue(p_team, coalesce(v_ids, '{}'));
  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke execute on function private.ninety_queue_team(uuid) from public, anon, authenticated;

-- Daily: sprints that start today or ended yesterday change which issues are "in the sprint".
create function private.ninety_queue_sprint_edges()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select w.team_id, array_agg(i.id) as ids
    from public.issue_cycles c
    join public.workspaces w on w.id = c.workspace_id
    join public.issues i on i.cycle_id = c.id
    where (c.starts_on = current_date or c.ends_on = current_date - 1)
    group by w.team_id
  loop
    if private.ninety_active(r.team_id) then
      perform private.ninety_queue(r.team_id, r.ids);
    end if;
  end loop;
end;
$$;

revoke execute on function private.ninety_queue_sprint_edges() from public, anon, authenticated;

-- Every minute: call the function only when there is work (attempts < 5: a row that kept failing
-- waits for "Sync now"). Costs nothing while the outbox is empty.
create function private.ninety_kick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.ninety_outbox o where o.attempts < 5) then return; end if;
  select c.function_url, s.decrypted_secret into v_url, v_secret
  from public.ninety_config c
  join vault.decrypted_secrets s on s.id = c.cron_secret_id;
  if v_url is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('action', 'drain'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-ninety-cron', v_secret),
    timeout_milliseconds := 55000
  );
end;
$$;

revoke execute on function private.ninety_kick() from public, anon, authenticated;

select cron.schedule('ninety-sync', '* * * * *', 'select private.ninety_kick()');
select cron.schedule('ninety-sprint-edges', '5 0 * * *', 'select private.ninety_queue_sprint_edges()');

-- ---------------------------------------------------------------------------------------- for the app

-- Link a project to a Ninety team (or unlink with null), and queue its issues. Group owners/admins
-- of a connected group with the flag. The Ninety team id comes from the function's list of teams.
create function public.ninety_set_workspace_team(p_workspace uuid, p_ninety_team_id text, p_ninety_team_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  select w.team_id into v_team from public.workspaces w where w.id = p_workspace;
  if v_team is null or not private.is_team_admin(v_team) then
    raise exception 'Only group owners and admins can do that' using errcode = '42501';
  end if;
  if not private.ninety_active(v_team) then
    raise exception 'Connect Ninety first' using errcode = 'P0001';
  end if;
  if p_ninety_team_id is null then
    delete from public.ninety_workspace_teams where workspace_id = p_workspace;
  else
    insert into public.ninety_workspace_teams (workspace_id, team_id, ninety_team_id, ninety_team_name)
    values (p_workspace, v_team, p_ninety_team_id, p_ninety_team_name)
    on conflict (workspace_id) do update set ninety_team_id = excluded.ninety_team_id, ninety_team_name = excluded.ninety_team_name;
  end if;
  perform private.ninety_queue(v_team, array(select i.id from public.issues i where i.workspace_id = p_workspace));
end;
$$;

-- Forget the connection: the token's secret, the links and the queue. To-Dos already in Ninety stay.
create function public.ninety_disconnect(p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret uuid;
begin
  if not private.is_team_admin(p_team) then
    raise exception 'Only group owners and admins can do that' using errcode = '42501';
  end if;
  delete from public.ninety_connections where team_id = p_team returning token_secret_id into v_secret;
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
  delete from public.ninety_workspace_teams where team_id = p_team;
  delete from public.ninety_links where team_id = p_team;
  delete from public.ninety_outbox where team_id = p_team;
end;
$$;

-- How much is waiting, for the settings page.
create function public.ninety_status(p_team uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_team_admin(p_team) then
    raise exception 'Only group owners and admins can do that' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'queued', (select count(*) from public.ninety_outbox o where o.team_id = p_team),
    'failing', (select count(*) from public.ninety_outbox o where o.team_id = p_team and o.attempts >= 5),
    'todos', (select count(*) from public.ninety_links l where l.team_id = p_team and not l.completed),
    'last_failure', (select o.last_error from public.ninety_outbox o where o.team_id = p_team and o.last_error is not null order by o.queued_at desc limit 1)
  );
end;
$$;

revoke execute on function public.ninety_set_workspace_team(uuid, text, text) from public, anon;
revoke execute on function public.ninety_disconnect(uuid) from public, anon;
revoke execute on function public.ninety_status(uuid) from public, anon;
grant execute on function public.ninety_set_workspace_team(uuid, text, text) to authenticated;
grant execute on function public.ninety_disconnect(uuid) to authenticated;
grant execute on function public.ninety_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------- for the function (service role only)

-- Saves (or replaces) a group's connection, its token in Vault, and the function's own URL.
create function public.ninety_save_connection(
  p_team uuid, p_token text, p_company_id text, p_owner_id text, p_owner_name text,
  p_app_url text, p_connected_by uuid, p_function_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  select c.token_secret_id into v_old from public.ninety_connections c where c.team_id = p_team;
  v_new := vault.create_secret(p_token, 'ninety_token_' || p_team || '_' || extract(epoch from now())::bigint, 'Ninety token for a DevDock group');
  insert into public.ninety_connections (team_id, token_secret_id, ninety_company_id, ninety_owner_id, ninety_owner_name, token_hint, app_url, connected_by)
  values (p_team, v_new, p_company_id, p_owner_id, p_owner_name, right(p_token, 4), p_app_url, p_connected_by)
  on conflict (team_id) do update set
    token_secret_id = excluded.token_secret_id, ninety_company_id = excluded.ninety_company_id,
    ninety_owner_id = excluded.ninety_owner_id, ninety_owner_name = excluded.ninety_owner_name,
    token_hint = excluded.token_hint, app_url = excluded.app_url, connected_by = excluded.connected_by,
    connected_at = now(), last_error = null, last_error_at = null;
  if v_old is not null then delete from vault.secrets where id = v_old; end if;
  update public.ninety_config set function_url = p_function_url;
end;
$$;

create function public.ninety_token(p_team uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from public.ninety_connections c
  join vault.decrypted_secrets s on s.id = c.token_secret_id
  where c.team_id = p_team;
$$;

create function public.ninety_cron_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret from public.ninety_config c join vault.decrypted_secrets s on s.id = c.cron_secret_id;
$$;

-- The group's people with their sign-in email, to match them to Ninety users.
create function public.ninety_member_emails(p_team uuid)
returns table (user_id uuid, email text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, lower(u.email::text), p.display_name
  from public.team_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.team_id = p_team;
$$;

create function public.ninety_queue_team_now(p_team uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.ninety_queue_team(p_team);
$$;

revoke execute on function public.ninety_save_connection(uuid, text, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.ninety_token(uuid) from public, anon, authenticated;
revoke execute on function public.ninety_cron_secret() from public, anon, authenticated;
revoke execute on function public.ninety_member_emails(uuid) from public, anon, authenticated;
revoke execute on function public.ninety_queue_team_now(uuid) from public, anon, authenticated;
grant execute on function public.ninety_save_connection(uuid, text, text, text, text, text, uuid, text) to service_role;
grant execute on function public.ninety_token(uuid) to service_role;
grant execute on function public.ninety_cron_secret() to service_role;
grant execute on function public.ninety_member_emails(uuid) to service_role;
grant execute on function public.ninety_queue_team_now(uuid) to service_role;
