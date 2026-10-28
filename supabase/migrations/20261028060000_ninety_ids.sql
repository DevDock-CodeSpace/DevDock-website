-- Ninety sync, phase 3 (docs/NINETY.md): issues labelled IDS become Ninety Issues, the list a team
-- Identifies, Discusses and Solves in its weekly meeting.
--
-- Every project linked to a Ninety team has an "IDS" label (made when it is linked; projects already
-- linked get one here). Adding or removing the label queues the issue, like any other change.

create table public.ninety_issue_links (
  issue_id        uuid primary key,
  team_id         uuid not null references public.teams (id) on delete cascade,
  ninety_issue_id text not null,
  sent_hash       text not null,
  completed       boolean not null default false,
  synced_at       timestamptz not null default now()
);

create index ninety_issue_links_team_idx on public.ninety_issue_links (team_id);
alter table public.ninety_issue_links enable row level security;
revoke all on public.ninety_issue_links from anon, authenticated;

-- The IDS label of a project, made if it's missing (any existing label named IDS, whatever its case, is it).
create function private.ninety_ensure_ids_label(p_workspace uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.issue_labels (workspace_id, name, color)
  select p_workspace, 'IDS', 'violet'
  where not exists (select 1 from public.issue_labels l where l.workspace_id = p_workspace and lower(btrim(l.name)) = 'ids');
$$;

revoke execute on function private.ninety_ensure_ids_label(uuid) from public, anon, authenticated;

select private.ninety_ensure_ids_label(l.workspace_id) from public.ninety_workspace_teams l;

-- Linking a project now also gives it the IDS label.
create or replace function public.ninety_set_workspace_team(p_workspace uuid, p_ninety_team_id text, p_ninety_team_name text)
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
    perform private.ninety_ensure_ids_label(p_workspace);
  end if;
  perform private.ninety_queue(v_team, array(select i.id from public.issues i where i.workspace_id = p_workspace));
end;
$$;

-- Adding or removing a label queues its issue (only the IDS label matters to Ninety, but a label's name
-- can change, so every link change is queued; unchanged issues cost nothing to send).
create function private.ninety_queue_label_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue uuid;
  v_team uuid;
begin
  if tg_op = 'DELETE' then v_issue := old.issue_id; else v_issue := new.issue_id; end if;
  select i.team_id into v_team from public.issues i where i.id = v_issue;
  if v_team is not null and private.ninety_active(v_team) then
    perform private.ninety_queue(v_team, array[v_issue]);
  end if;
  return null;
end;
$$;

revoke execute on function private.ninety_queue_label_link() from public, anon, authenticated;

create trigger ninety_queue_label_link after insert or delete on public.issue_label_links
  for each row execute function private.ninety_queue_label_link();

-- Renaming a label to or from IDS changes its issues.
create function private.ninety_queue_label_rename()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if lower(btrim(old.name)) = lower(btrim(new.name)) then return null; end if;
  if lower(btrim(old.name)) <> 'ids' and lower(btrim(new.name)) <> 'ids' then return null; end if;
  select w.team_id into v_team from public.workspaces w where w.id = new.workspace_id;
  if v_team is not null and private.ninety_active(v_team) then
    perform private.ninety_queue(v_team, array(select k.issue_id from public.issue_label_links k where k.label_id = new.id));
  end if;
  return null;
end;
$$;

revoke execute on function private.ninety_queue_label_rename() from public, anon, authenticated;

create trigger ninety_queue_label_rename after update of name on public.issue_labels
  for each row execute function private.ninety_queue_label_rename();

-- Status and disconnect know the new links.
create or replace function public.ninety_disconnect(p_team uuid)
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
  delete from public.ninety_rock_links where team_id = p_team;
  delete from public.ninety_milestone_links where team_id = p_team;
  delete from public.ninety_plan_outbox where team_id = p_team;
  delete from public.ninety_issue_links where team_id = p_team;
end;
$$;

create or replace function public.ninety_status(p_team uuid)
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
    'queued', (select count(*) from public.ninety_outbox o where o.team_id = p_team)
            + (select count(*) from public.ninety_plan_outbox o where o.team_id = p_team),
    'failing', (select count(*) from public.ninety_outbox o where o.team_id = p_team and o.attempts >= 5)
             + (select count(*) from public.ninety_plan_outbox o where o.team_id = p_team and o.attempts >= 5),
    'todos', (select count(*) from public.ninety_links l where l.team_id = p_team and not l.completed),
    'rocks', (select count(*) from public.ninety_rock_links r where r.team_id = p_team),
    'milestones', (select count(*) from public.ninety_milestone_links m where m.team_id = p_team and not m.removed),
    'ids', (select count(*) from public.ninety_issue_links k where k.team_id = p_team and not k.completed),
    'last_failure', coalesce(
      (select o.last_error from public.ninety_plan_outbox o where o.team_id = p_team and o.last_error is not null order by o.queued_at desc limit 1),
      (select o.last_error from public.ninety_outbox o where o.team_id = p_team and o.last_error is not null order by o.queued_at desc limit 1))
  );
end;
$$;

-- Which of these issues carry the IDS label (for the function).
create function public.ninety_ids_issues(p_issues uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct k.issue_id
  from public.issue_label_links k
  join public.issue_labels l on l.id = k.label_id
  where k.issue_id = any(p_issues) and lower(btrim(l.name)) = 'ids';
$$;

revoke execute on function public.ninety_ids_issues(uuid[]) from public, anon, authenticated;
grant execute on function public.ninety_ids_issues(uuid[]) to service_role;
