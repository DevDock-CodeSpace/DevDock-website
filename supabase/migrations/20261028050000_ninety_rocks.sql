-- Ninety sync, phase 2 (docs/NINETY.md): Plans become Ninety Rocks, the plan's issues that have a due
-- date become the Rock's Milestones, and an issue's To-Do is linked to its plan's Rock.
--
-- Plans are group-wide, so their Rocks go to one Ninety team chosen for the group (rocks_ninety_team_id;
-- none = no Rocks). Ninety can't delete a Milestone through its API: one whose issue leaves the plan is
-- completed and marked "(removed)".

alter table public.ninety_connections
  add column rocks_ninety_team_id text check (char_length(rocks_ninety_team_id) between 1 and 64),
  add column rocks_ninety_team_name text check (char_length(rocks_ninety_team_name) between 1 and 200);

grant select (rocks_ninety_team_id, rocks_ninety_team_name) on public.ninety_connections to authenticated;

-- The Rock a To-Do is linked to in Ninety (its issue's plan's Rock), so a plan change moves the link.
alter table public.ninety_links add column linked_rock_id text;

-- Plan ↔ Rock. No foreign key to plans: a deleted plan's Rock still has to be deleted.
create table public.ninety_rock_links (
  plan_id        uuid primary key,
  team_id        uuid not null references public.teams (id) on delete cascade,
  ninety_rock_id text not null,
  sent_hash      text not null,
  synced_at      timestamptz not null default now()
);

-- Issue ↔ Milestone (one per issue). removed: completed and marked "(removed)" after leaving the plan.
create table public.ninety_milestone_links (
  issue_id            uuid primary key,
  team_id             uuid not null references public.teams (id) on delete cascade,
  ninety_milestone_id text not null,
  ninety_rock_id      text not null,
  sent_hash           text not null,
  removed             boolean not null default false,
  synced_at           timestamptz not null default now()
);

-- Plans waiting to be sent.
create table public.ninety_plan_outbox (
  plan_id    uuid primary key,
  team_id    uuid not null references public.teams (id) on delete cascade,
  queued_at  timestamptz not null default now(),
  attempts   integer not null default 0,
  last_error text
);

create index ninety_rock_links_team_idx on public.ninety_rock_links (team_id);
create index ninety_milestone_links_team_idx on public.ninety_milestone_links (team_id);
create index ninety_plan_outbox_team_idx on public.ninety_plan_outbox (team_id, queued_at);

alter table public.ninety_rock_links enable row level security;
alter table public.ninety_milestone_links enable row level security;
alter table public.ninety_plan_outbox enable row level security;
revoke all on public.ninety_rock_links, public.ninety_milestone_links, public.ninety_plan_outbox from anon, authenticated;

-- ---------------------------------------------------------------------------------------- queueing

create function private.ninety_queue_plans(p_team uuid, p_plans uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ninety_plan_outbox (plan_id, team_id)
  select p, p_team from unnest(p_plans) as p
  on conflict (plan_id) do update set queued_at = now(), attempts = 0, last_error = null;
$$;

revoke execute on function private.ninety_queue_plans(uuid, uuid[]) from public, anon, authenticated;

create function private.ninety_queue_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_plan uuid;
begin
  if tg_op = 'DELETE' then
    v_team := old.team_id; v_plan := old.id;
  else
    v_team := new.team_id; v_plan := new.id;
  end if;
  if private.ninety_active(v_team) then
    perform private.ninety_queue_plans(v_team, array[v_plan]);
  end if;
  return null;
end;
$$;

revoke execute on function private.ninety_queue_plan() from public, anon, authenticated;

create trigger ninety_queue_plan_insert after insert on public.plans
  for each row execute function private.ninety_queue_plan();
create trigger ninety_queue_plan_update after update of name, status, lead_id, target_on on public.plans
  for each row execute function private.ninety_queue_plan();
create trigger ninety_queue_plan_delete after delete on public.plans
  for each row execute function private.ninety_queue_plan();

-- An issue's plan now matters too (its Milestone and its To-Do's Rock link).
drop trigger ninety_queue_update on public.issues;
create trigger ninety_queue_update
  after update of title, status, assignee_id, due_date, cycle_id, workspace_id, number, plan_id on public.issues
  for each row execute function private.ninety_queue_issue();

-- Every plan and every issue of the group that has, or could have, something in Ninety.
create or replace function private.ninety_queue_team(p_team uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_plans uuid[];
begin
  select array_agg(i.id) into v_ids
  from public.issues i
  where i.team_id = p_team
    and (i.workspace_id in (select l.workspace_id from public.ninety_workspace_teams l where l.team_id = p_team)
         or i.id in (select k.issue_id from public.ninety_links k where k.team_id = p_team)
         or i.id in (select m.issue_id from public.ninety_milestone_links m where m.team_id = p_team)
         or (i.plan_id is not null and i.due_date is not null));
  perform private.ninety_queue(p_team, coalesce(v_ids, '{}'));

  select array_agg(p.id) into v_plans from public.plans p where p.team_id = p_team;
  -- Deleted plans that still have a Rock.
  v_plans := coalesce(v_plans, '{}') || coalesce((select array_agg(r.plan_id) from public.ninety_rock_links r
                                                   where r.team_id = p_team and not exists (select 1 from public.plans p where p.id = r.plan_id)), '{}');
  perform private.ninety_queue_plans(p_team, v_plans);
  return coalesce(array_length(v_ids, 1), 0) + coalesce(array_length(v_plans, 1), 0);
end;
$$;

-- Every minute: the plan queue counts as work too.
create or replace function private.ninety_kick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.ninety_outbox o where o.attempts < 5)
     and not exists (select 1 from public.ninety_plan_outbox o where o.attempts < 5) then
    return;
  end if;
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

-- ---------------------------------------------------------------------------------------- for the app

-- Which Ninety team gets the group's Rocks (null: none). Queues every plan (and so their issues).
create function public.ninety_set_rocks_team(p_team uuid, p_ninety_team_id text, p_ninety_team_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_team_admin(p_team) then
    raise exception 'Only group owners and admins can do that' using errcode = '42501';
  end if;
  if not private.ninety_active(p_team) then
    raise exception 'Connect Ninety first' using errcode = 'P0001';
  end if;
  update public.ninety_connections
     set rocks_ninety_team_id = p_ninety_team_id,
         rocks_ninety_team_name = case when p_ninety_team_id is null then null else p_ninety_team_name end
   where team_id = p_team;
  perform private.ninety_queue_team(p_team);
end;
$$;

revoke execute on function public.ninety_set_rocks_team(uuid, text, text) from public, anon;
grant execute on function public.ninety_set_rocks_team(uuid, text, text) to authenticated;

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
    'last_failure', coalesce(
      (select o.last_error from public.ninety_plan_outbox o where o.team_id = p_team and o.last_error is not null order by o.queued_at desc limit 1),
      (select o.last_error from public.ninety_outbox o where o.team_id = p_team and o.last_error is not null order by o.queued_at desc limit 1))
  );
end;
$$;

-- Daily: sprints that start or ended (To-Dos), and plans whose target date has just passed (their Rock
-- turns Off track).
create or replace function private.ninety_queue_sprint_edges()
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
  for r in
    select p.team_id, array_agg(p.id) as ids
    from public.plans p
    where p.target_on = current_date - 1 and p.status not in ('done', 'canceled')
    group by p.team_id
  loop
    if private.ninety_active(r.team_id) then
      perform private.ninety_queue_plans(r.team_id, r.ids);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------- for the function (service role only)

-- Once a plan has its Rock, its issues are queued so their Milestones and To-Do links follow.
create function public.ninety_queue_plan_issues(p_team uuid, p_plan uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.ninety_queue(p_team, coalesce(array(select i.id from public.issues i where i.plan_id = p_plan and i.team_id = p_team), '{}'));
$$;

revoke execute on function public.ninety_queue_plan_issues(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ninety_queue_plan_issues(uuid, uuid) to service_role;
