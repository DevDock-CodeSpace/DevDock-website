-- Plans (owner's choice, 2026-10-27; docs/ISSUES_HUB_PLAN.md): Linear's "projects". A plan is a goal
-- assigned to issues, like a label with a page: name, description, lead, status, dates, and progress
-- from its issues. Issues still live in a project (number, labels, sprints); a plan is optional, at
-- most one per issue, and can gather issues from several projects of the group.
--
-- Access: everyone in the group reads plans and anyone in the group creates one (the creator leads
-- it); the lead, the creator and group owners/admins edit and delete. Setting an issue's plan needs
-- edit rights on the issue (as for any field). Deleting a plan leaves its issues.
--
-- Also here: favorites (issue_pins) can hold an issue, a plan or "My issues", for the sidebar's
-- Favorites section; and import_issues creates plans from a Linear file's projects.

create type public.plan_status as enum ('not_started', 'in_progress', 'paused', 'done', 'canceled');

create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  name        text not null,
  description jsonb,
  status      public.plan_status not null default 'not_started',
  lead_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  starts_on   date,
  target_on   date,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint plans_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint plans_description_size check (description is null or octet_length(description::text) <= 1000000),
  constraint plans_dates check (target_on is null or starts_on is null or target_on >= starts_on)
);

comment on table public.plans is 'Goals in a group (Linear''s projects), assigned to issues. See docs/ISSUES_HUB_PLAN.md.';

create unique index plans_name_key on public.plans (team_id, lower(btrim(name)));
create index plans_lead_idx on public.plans (lead_id);
create index plans_created_by_idx on public.plans (created_by);

create trigger set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- The lead must be in the group.
create function private.check_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is not null
     and (tg_op = 'INSERT' or new.lead_id is distinct from old.lead_id)
     and not exists (select 1 from public.team_members m where m.team_id = new.team_id and m.user_id = new.lead_id) then
    raise exception 'The lead must be in this group' using errcode = '23514';
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

create trigger check_plan
  before insert or update on public.plans
  for each row execute function private.check_plan();

revoke all on function private.check_plan() from public, anon, authenticated;

revoke all on table public.plans from anon, authenticated;
grant select, delete on table public.plans to authenticated;
grant insert (team_id, name, description, status, lead_id, starts_on, target_on) on table public.plans to authenticated;
grant update (name, description, status, lead_id, starts_on, target_on) on table public.plans to authenticated;

alter table public.plans enable row level security;

create policy "Group members read plans"
  on public.plans for select to authenticated
  using (private.is_team_member(team_id));

create policy "Group members create plans"
  on public.plans for insert to authenticated
  with check (private.is_team_member(team_id));

create policy "Leads and admins edit plans"
  on public.plans for update to authenticated
  using (lead_id = (select auth.uid()) or created_by = (select auth.uid()) or private.is_team_admin(team_id))
  with check (private.is_team_member(team_id));

create policy "Leads and admins delete plans"
  on public.plans for delete to authenticated
  using (lead_id = (select auth.uid()) or created_by = (select auth.uid()) or private.is_team_admin(team_id));

-- ---------------------------------------------------------------------------------------------------
-- issues.plan_id

alter table public.issues add column plan_id uuid references public.plans (id) on delete set null;
create index issues_plan_idx on public.issues (plan_id);
grant insert (plan_id), update (plan_id) on table public.issues to authenticated;

-- A plan from the issue's own group. (Its own trigger, so check_issue stays as it is.)
create function private.check_issue_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan_id is not null
     and (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id)
     and not exists (
       select 1 from public.plans p join public.workspaces w on w.team_id = p.team_id
       where p.id = new.plan_id and w.id = new.workspace_id
     ) then
    raise exception 'The plan must be in the same group' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_issue_plan
  before insert or update of plan_id on public.issues
  for each row execute function private.check_issue_plan();

revoke all on function private.check_issue_plan() from public, anon, authenticated;

-- Activity: plan changes (values are plan ids).
alter table public.issue_activity drop constraint issue_activity_kind;
alter table public.issue_activity add constraint issue_activity_kind check (kind in (
  'created', 'title', 'status', 'priority', 'assignee', 'parent', 'cycle',
  'estimate', 'due_date', 'label_added', 'label_removed', 'repo',
  'pr_linked', 'pr_merged', 'pr_closed', 'branch_created', 'plan'
));

create or replace function private.log_issue_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  source text := nullif(current_setting('devdock.via', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.issue_activity (issue_id, workspace_id, actor_id, kind, via)
    values (new.id, new.workspace_id, actor, 'created', source);
    return null;
  end if;

  insert into public.issue_activity (issue_id, workspace_id, actor_id, kind, from_value, to_value, via)
  select new.id, new.workspace_id, actor, c.kind, c.old_value, c.new_value, source
  from (values
    ('title',    old.title,              new.title),
    ('status',   old.status::text,       new.status::text),
    ('priority', old.priority::text,     new.priority::text),
    ('assignee', old.assignee_id::text,  new.assignee_id::text),
    ('parent',   old.parent_id::text,    new.parent_id::text),
    ('cycle',    old.cycle_id::text,     new.cycle_id::text),
    ('estimate', old.estimate::text,     new.estimate::text),
    ('due_date', old.due_date::text,     new.due_date::text),
    ('repo',     old.repo_id::text,      new.repo_id::text),
    ('plan',     old.plan_id::text,      new.plan_id::text)
  ) as c(kind, old_value, new_value)
  where c.old_value is distinct from c.new_value;
  return null;
end;
$$;
revoke all on function private.log_issue_activity() from public, anon, authenticated;

-- Live updates for plans (lib/realtime AFFECTS 'plans').
do $$
begin
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plans') then
    alter publication supabase_realtime add table public.plans;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Favorites: issue_pins can also hold an issue, a plan, or "My issues" (the Issues hub's own tab).
-- Those aren't tied to one project's views: a plan and "My issues" have no workspace; an issue's pin
-- takes its issue's workspace.

alter table public.issue_pins
  alter column workspace_id drop not null,
  add column issue_id uuid references public.issues (id) on delete cascade,
  add column plan_id uuid references public.plans (id) on delete cascade;

create index issue_pins_issue_idx on public.issue_pins (issue_id);
create index issue_pins_plan_idx on public.issue_pins (plan_id);

alter table public.issue_pins drop constraint issue_pins_kind_check;
alter table public.issue_pins add constraint issue_pins_kind_check
  check (kind in ('view', 'person', 'tab', 'cycle', 'current_cycle', 'issue', 'plan', 'my_issues'));

alter table public.issue_pins drop constraint issue_pins_target;
alter table public.issue_pins add constraint issue_pins_target check (
  (kind = 'view' and view_id is not null and person_id is null and tab is null and cycle_id is null and issue_id is null and plan_id is null and workspace_id is not null)
  or (kind = 'person' and person_id is not null and view_id is null and tab is null and cycle_id is null and issue_id is null and plan_id is null and workspace_id is not null)
  or (kind = 'tab' and tab is not null and view_id is null and person_id is null and cycle_id is null and issue_id is null and plan_id is null and workspace_id is not null)
  or (kind = 'cycle' and cycle_id is not null and view_id is null and person_id is null and tab is null and issue_id is null and plan_id is null and workspace_id is not null)
  or (kind = 'current_cycle' and view_id is null and person_id is null and tab is null and cycle_id is null and issue_id is null and plan_id is null and workspace_id is not null)
  or (kind = 'issue' and issue_id is not null and view_id is null and person_id is null and tab is null and cycle_id is null and plan_id is null)
  or (kind = 'plan' and plan_id is not null and workspace_id is null and view_id is null and person_id is null and tab is null and cycle_id is null and issue_id is null)
  or (kind = 'my_issues' and workspace_id is null and view_id is null and person_id is null and tab is null and cycle_id is null and issue_id is null and plan_id is null)
);

create unique index issue_pins_issue_key on public.issue_pins (user_id, issue_id) where kind = 'issue';
create unique index issue_pins_plan_key on public.issue_pins (user_id, plan_id) where kind = 'plan';
create unique index issue_pins_my_issues_key on public.issue_pins (user_id, team_id) where kind = 'my_issues';

grant insert (team_id, issue_id, plan_id) on table public.issue_pins to authenticated;

-- The group comes from the workspace (project pins), the issue, the plan, or (My issues) the caller.
create or replace function private.prepare_issue_pin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'issue' then
    select i.workspace_id into new.workspace_id from public.issues i where i.id = new.issue_id;
    if new.workspace_id is null then raise exception 'Issue not found' using errcode = '23503'; end if;
  end if;
  if new.kind = 'plan' then
    select p.team_id into new.team_id from public.plans p where p.id = new.plan_id;
    if new.team_id is null then raise exception 'Plan not found' using errcode = '23503'; end if;
  elsif new.workspace_id is not null then
    select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;
    if new.team_id is null then raise exception 'Workspace not found' using errcode = '23503'; end if;
  elsif new.team_id is null then
    raise exception 'Group not found' using errcode = '23503';
  end if;
  if new.kind = 'person' and not exists (
    select 1 from public.team_members tm where tm.team_id = new.team_id and tm.user_id = new.person_id
  ) then
    raise exception 'That person is not in this group' using errcode = '23514';
  end if;
  if (select count(*) from public.issue_pins p where p.user_id = new.user_id and p.team_id = new.team_id) >= 30 then
    raise exception 'You can pin at most 30 items' using errcode = '54000';
  end if;
  new.position := coalesce((select max(p.position) from public.issue_pins p where p.user_id = new.user_id and p.team_id = new.team_id), 0) + 1;
  return new;
end;
$$;

drop policy "People see their own pins" on public.issue_pins;
create policy "People see their own pins"
  on public.issue_pins for select to authenticated
  using (
    user_id = (select auth.uid())
    and (case when workspace_id is null then private.is_team_member(team_id) else private.can_view_workspace(workspace_id) end)
  );

drop policy "People pin what they can see" on public.issue_pins;
create policy "People pin what they can see"
  on public.issue_pins for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (case when workspace_id is null then private.is_team_member(team_id) else private.can_view_workspace(workspace_id) end)
    and (kind <> 'view' or exists (
      select 1 from public.issue_views v where v.id = issue_pins.view_id and v.workspace_id = issue_pins.workspace_id
    ))
    and (kind <> 'cycle' or exists (
      select 1 from public.issue_cycles c where c.id = issue_pins.cycle_id and c.workspace_id = issue_pins.workspace_id
    ))
    and (kind <> 'issue' or exists (
      select 1 from public.issues i where i.id = issue_pins.issue_id and i.workspace_id = issue_pins.workspace_id
    ))
    and (kind <> 'plan' or exists (
      select 1 from public.plans p where p.id = issue_pins.plan_id and p.team_id = issue_pins.team_id
    ))
  );

-- ---------------------------------------------------------------------------------------------------
-- import_issues gains p_plans: [{ ref, name }], the file's Linear projects. Each becomes a plan of the
-- group (an existing plan with the same name, ignoring case, is reused), and issues name theirs with
-- plan_ref. Returns plans_created too.

drop function public.import_issues(uuid, text, jsonb, jsonb, jsonb);

create function public.import_issues(
  p_workspace_id uuid, p_source text, p_issues jsonb, p_cycles jsonb default '[]', p_people jsonb default '[]', p_plans jsonb default '[]'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  label_name text;
  label uuid;
  new_id uuid;
  parent uuid;
  group_id uuid;
  ids jsonb := '{}';          -- issue ref → issue id, for parent links
  sprints jsonb := '{}';      -- sprint ref → sprint id
  plan_ids jsonb := '{}';     -- plan ref → plan id
  created integer := 0;
  skipped integer := 0;
  labels_created integer := 0;
  sprints_created integer := 0;
  sprints_skipped integer := 0;
  plans_created integer := 0;
begin
  if not private.can_manage_workspace(p_workspace_id) then
    raise exception 'Only workspace leads and group owners/admins can import issues' using errcode = '42501';
  end if;
  if jsonb_typeof(p_issues) <> 'array' or jsonb_typeof(coalesce(p_cycles, '[]')) <> 'array'
     or jsonb_typeof(coalesce(p_people, '[]')) <> 'array' or jsonb_typeof(coalesce(p_plans, '[]')) <> 'array' then
    raise exception 'Issues, sprints, people and plans must be lists' using errcode = '22023';
  end if;
  if jsonb_array_length(p_issues) > 1000 then
    raise exception 'At most 1000 issues per import' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_cycles, '[]')) > 200 or jsonb_array_length(coalesce(p_people, '[]')) > 1000
     or jsonb_array_length(coalesce(p_plans, '[]')) > 200 then
    raise exception 'Too many sprints, people or plans in one import' using errcode = '22023';
  end if;
  select w.team_id into group_id from public.workspaces w where w.id = p_workspace_id;

  insert into public.issue_import_people as p (workspace_id, name, user_id)
  select distinct on (left(btrim(x ->> 'name'), 200)) p_workspace_id, left(btrim(x ->> 'name'), 200), (x ->> 'user_id')::uuid
  from jsonb_array_elements(coalesce(p_people, '[]')) x
  where btrim(coalesce(x ->> 'name', '')) <> ''
  on conflict (workspace_id, name) do update set user_id = coalesce(excluded.user_id, p.user_id)
    where excluded.user_id is not null and excluded.user_id is distinct from p.user_id;

  for item in select * from jsonb_array_elements(coalesce(p_plans, '[]')) loop
    select p.id into new_id from public.plans p
    where p.team_id = group_id and lower(p.name) = lower(btrim(item ->> 'name'));
    if new_id is null then
      insert into public.plans (team_id, name, status) values (group_id, left(btrim(item ->> 'name'), 120), 'in_progress')
      returning id into new_id;
      plans_created := plans_created + 1;
    end if;
    plan_ids := plan_ids || jsonb_build_object(item ->> 'ref', new_id);
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_cycles, '[]')) loop
    if exists (
      select 1 from public.issue_cycles c
      where c.workspace_id = p_workspace_id
        and daterange(c.starts_on, c.ends_on, '[]') && daterange((item ->> 'starts_on')::date, (item ->> 'ends_on')::date, '[]')
    ) then
      sprints_skipped := sprints_skipped + 1;
      continue;
    end if;
    perform set_config('devdock.cycle_number', coalesce(item ->> 'number', ''), true);
    insert into public.issue_cycles (workspace_id, name, starts_on, ends_on)
    values (p_workspace_id, nullif(left(btrim(item ->> 'name'), 80), ''), (item ->> 'starts_on')::date, (item ->> 'ends_on')::date)
    returning id into new_id;
    sprints := sprints || jsonb_build_object(item ->> 'ref', new_id);
    sprints_created := sprints_created + 1;
  end loop;
  perform set_config('devdock.cycle_number', '', true);

  -- Rows imported before: skipped, but sub-issues in this file can still point at them.
  select coalesce(jsonb_object_agg(i.import_ref, i.id), '{}') into ids
  from public.issues i
  where i.workspace_id = p_workspace_id
    and i.import_source = p_source
    and i.import_ref in (select x ->> 'ref' from jsonb_array_elements(p_issues) x);

  for item in select * from jsonb_array_elements(p_issues) loop
    if ids ? (item ->> 'ref') then
      skipped := skipped + 1;
      continue;
    end if;

    parent := (ids ->> (item ->> 'parent_ref'))::uuid;

    insert into public.issues (
      workspace_id, title, description, status, priority, assignee_id, import_assignee, parent_id,
      estimate, due_date, cycle_id, plan_id, import_source, import_ref
    ) values (
      p_workspace_id,
      left(btrim(item ->> 'title'), 300),
      case when jsonb_typeof(item -> 'description') = 'object' then item -> 'description' end,
      coalesce((item ->> 'status')::public.issue_status, 'todo'),
      coalesce((item ->> 'priority')::smallint, 0),
      (item ->> 'assignee_id')::uuid,
      nullif(left(btrim(item ->> 'import_assignee'), 200), ''),
      parent,
      (item ->> 'estimate')::smallint,
      (item ->> 'due_date')::date,
      coalesce((item ->> 'cycle_id')::uuid, (sprints ->> (item ->> 'cycle_ref'))::uuid),
      coalesce((item ->> 'plan_id')::uuid, (plan_ids ->> (item ->> 'plan_ref'))::uuid),
      p_source,
      item ->> 'ref'
    )
    returning id into new_id;

    ids := ids || jsonb_build_object(item ->> 'ref', new_id);
    created := created + 1;

    if jsonb_typeof(item -> 'labels') = 'array' then
      for label_name in select distinct left(btrim(x), 40) from jsonb_array_elements_text(item -> 'labels') x where btrim(x) <> '' loop
        select l.id into label from public.issue_labels l
        where l.workspace_id = p_workspace_id and lower(btrim(l.name)) = lower(label_name);
        if label is null then
          insert into public.issue_labels (workspace_id, name, color)
          values (p_workspace_id, label_name, 'default')
          returning id into label;
          labels_created := labels_created + 1;
        end if;
        insert into public.issue_label_links (issue_id, label_id, workspace_id)
        values (new_id, label, p_workspace_id)
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'created', created, 'skipped', skipped, 'labels_created', labels_created,
    'sprints_created', sprints_created, 'sprints_skipped', sprints_skipped, 'plans_created', plans_created
  );
end;
$$;

revoke all on function public.import_issues(uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_issues(uuid, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
