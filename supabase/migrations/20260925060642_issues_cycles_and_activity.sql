-- Issues, phase 2: cycles (Linear's sprints) and an activity log.
--
-- Cycles: time-boxed, numbered per workspace (Cycle 1, 2, …), never
-- overlapping. Workspace managers (leads + team owners/admins) create, edit
-- and delete them; anyone who can edit issues can put an issue in a cycle.
-- Deleting a cycle keeps its issues (cycle_id → null).
--
-- Activity: one row per change to an issue's title, status, priority,
-- assignee, parent, cycle, estimate, due date or labels, plus "created".
-- Written only by triggers (security definer), readable by workspace viewers;
-- clients can't write, edit or delete it.

-- ---------------------------------------------------------------------------
-- cycles
-- ---------------------------------------------------------------------------
create table public.issue_cycles (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  number       integer not null,
  name         text,
  starts_on    date not null,
  ends_on      date not null,
  created_at   timestamptz not null default now(),

  constraint issue_cycles_name_length check (name is null or char_length(btrim(name)) between 1 and 80),
  constraint issue_cycles_dates check (ends_on >= starts_on),
  constraint issue_cycles_number_unique unique (workspace_id, number)
);

comment on table public.issue_cycles is 'Linear-style cycles (sprints) in a workspace. Numbered per workspace; never overlap.';

create index issue_cycles_workspace_dates_idx on public.issue_cycles (workspace_id, starts_on);

-- Number new cycles (next in the workspace) and refuse overlapping dates.
-- security definer so the checks see every cycle in the workspace.
create function private.prepare_issue_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Serialize numbering per workspace (two managers creating at once).
    perform pg_advisory_xact_lock(hashtext('issue_cycles:' || new.workspace_id::text));
    select coalesce(max(c.number), 0) + 1 into new.number
    from public.issue_cycles c where c.workspace_id = new.workspace_id;
  end if;
  -- Reversed dates are left to the issue_cycles_dates check (a clearer error
  -- than daterange's).
  if new.ends_on >= new.starts_on and exists (
    select 1 from public.issue_cycles c
    where c.workspace_id = new.workspace_id
      and c.id <> new.id
      and daterange(c.starts_on, c.ends_on, '[]') && daterange(new.starts_on, new.ends_on, '[]')
  ) then
    raise exception 'Cycles can''t overlap' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger prepare_issue_cycle
  before insert or update on public.issue_cycles
  for each row execute function private.prepare_issue_cycle();

-- ---------------------------------------------------------------------------
-- issues.cycle_id (same workspace, checked in check_issue below)
-- ---------------------------------------------------------------------------
alter table public.issues
  add column cycle_id uuid references public.issue_cycles (id) on delete set null;

create index issues_cycle_idx on public.issues (cycle_id);

grant insert (cycle_id), update (cycle_id) on table public.issues to authenticated;

-- Same rules as before, plus: the cycle must be in the issue's workspace.
create or replace function private.check_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (
       select 1 from public.workspace_members m
       where m.workspace_id = new.workspace_id and m.user_id = new.assignee_id
     ) then
    raise exception 'The assignee must be a member of this workspace' using errcode = '23514';
  end if;

  if new.cycle_id is not null
     and (tg_op = 'INSERT' or new.cycle_id is distinct from old.cycle_id)
     and not exists (
       select 1 from public.issue_cycles c
       where c.id = new.cycle_id and c.workspace_id = new.workspace_id
     ) then
    raise exception 'The cycle must be in the same workspace' using errcode = '23514';
  end if;

  if new.parent_id is not null
     and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    if new.parent_id = new.id then
      raise exception 'An issue can''t be its own parent' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.issues p
      where p.id = new.parent_id and p.workspace_id = new.workspace_id
    ) then
      raise exception 'The parent issue must be in the same workspace' using errcode = '23514';
    end if;
    if exists (
      with recursive up as (
        select p.id, p.parent_id, 1 as depth from public.issues p where p.id = new.parent_id
        union all
        select p.id, p.parent_id, up.depth + 1
        from public.issues p join up on p.id = up.parent_id
        where up.depth < 100
      )
      select 1 from up where up.id = new.id
    ) then
      raise exception 'That would make an issue a sub-issue of itself' using errcode = '23514';
    end if;
  end if;

  if new.status in ('done', 'canceled') then
    if tg_op = 'INSERT' or old.status not in ('done', 'canceled') then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- Move a cycle's unfinished issues to another cycle (or out of cycles when
-- p_to is null). Runs under RLS; the check_issue trigger keeps cycles in the
-- same workspace. Returns how many issues moved.
create function public.move_open_issues(p_from uuid, p_to uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moved integer;
begin
  update public.issues i
  set cycle_id = p_to
  where i.cycle_id = p_from and i.status not in ('done', 'canceled');
  get diagnostics moved = row_count;
  return moved;
end;
$$;

revoke all on function public.move_open_issues(uuid, uuid) from public, anon;
grant execute on function public.move_open_issues(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- activity
-- ---------------------------------------------------------------------------
create table public.issue_activity (
  id           bigint generated always as identity primary key,
  issue_id     uuid not null,
  workspace_id uuid not null,
  actor_id     uuid references public.profiles (id) on delete set null,
  kind         text not null,
  -- Previous/new value as text: enum names, numbers, dates, ids (assignee,
  -- parent, cycle) or, for labels, the label's name at the time.
  from_value   text,
  to_value     text,
  created_at   timestamptz not null default now(),

  constraint issue_activity_kind check (kind in (
    'created', 'title', 'status', 'priority', 'assignee', 'parent', 'cycle',
    'estimate', 'due_date', 'label_added', 'label_removed'
  )),
  constraint issue_activity_issue_fkey foreign key (issue_id, workspace_id)
    references public.issues (id, workspace_id) on delete cascade
);

comment on table public.issue_activity is 'Issue history, written by triggers only.';

create index issue_activity_issue_idx on public.issue_activity (issue_id, created_at);
create index issue_activity_actor_idx on public.issue_activity (actor_id);

create function private.log_issue_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.issue_activity (issue_id, workspace_id, actor_id, kind)
    values (new.id, new.workspace_id, actor, 'created');
    return null;
  end if;

  insert into public.issue_activity (issue_id, workspace_id, actor_id, kind, from_value, to_value)
  select new.id, new.workspace_id, actor, c.kind, c.old_value, c.new_value
  from (values
    ('title',    old.title,              new.title),
    ('status',   old.status::text,       new.status::text),
    ('priority', old.priority::text,     new.priority::text),
    ('assignee', old.assignee_id::text,  new.assignee_id::text),
    ('parent',   old.parent_id::text,    new.parent_id::text),
    ('cycle',    old.cycle_id::text,     new.cycle_id::text),
    ('estimate', old.estimate::text,     new.estimate::text),
    ('due_date', old.due_date::text,     new.due_date::text)
  ) as c(kind, old_value, new_value)
  where c.old_value is distinct from c.new_value;
  return null;
end;
$$;

create trigger log_issue_activity
  after insert or update on public.issues
  for each row execute function private.log_issue_activity();

-- Label added/removed, logged with the label's name. Removals caused by
-- deleting the issue or the label itself aren't logged (nothing to show them on,
-- or not a change to the issue).
create function private.log_issue_label_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.issue_label_links := case when tg_op = 'INSERT' then new else old end;
  label_name text := (select l.name from public.issue_labels l where l.id = link.label_id);
begin
  if label_name is null or not exists (select 1 from public.issues i where i.id = link.issue_id) then
    return null;
  end if;
  insert into public.issue_activity (issue_id, workspace_id, actor_id, kind, to_value)
  values (
    link.issue_id, link.workspace_id, (select auth.uid()),
    case when tg_op = 'INSERT' then 'label_added' else 'label_removed' end,
    label_name
  );
  return null;
end;
$$;

create trigger log_issue_label_activity
  after insert or delete on public.issue_label_links
  for each row execute function private.log_issue_label_activity();

revoke all on function
  private.prepare_issue_cycle(),
  private.log_issue_activity(),
  private.log_issue_label_activity()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.issue_cycles, public.issue_activity from anon, authenticated;

grant select, delete on table public.issue_cycles to authenticated;
grant insert (workspace_id, name, starts_on, ends_on), update (name, starts_on, ends_on)
  on table public.issue_cycles to authenticated;

-- Read-only for clients: only the triggers above write activity.
grant select on table public.issue_activity to authenticated;

alter table public.issue_cycles enable row level security;
alter table public.issue_activity enable row level security;

create policy "Workspace viewers can see cycles"
  on public.issue_cycles for select to authenticated
  using (private.can_view_workspace(workspace_id));

create policy "Workspace managers can create cycles"
  on public.issue_cycles for insert to authenticated
  with check (private.can_manage_workspace(workspace_id));

create policy "Workspace managers can edit cycles"
  on public.issue_cycles for update to authenticated
  using (private.can_manage_workspace(workspace_id))
  with check (private.can_manage_workspace(workspace_id));

create policy "Workspace managers can delete cycles"
  on public.issue_cycles for delete to authenticated
  using (private.can_manage_workspace(workspace_id));

create policy "Workspace viewers can see issue activity"
  on public.issue_activity for select to authenticated
  using (private.can_view_workspace(workspace_id));
