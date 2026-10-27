-- Two plan rules (owner's choices, 2026-10-27):
--
-- * A project's Issues page filters by plan, so saved views may keep a "plan" filter.
-- * A sub-issue belongs to its parent's plan, always: it takes it when it is made or given a parent,
--   and follows when the parent's plan changes (sub-sub-issues too, one level at a time). Its own plan
--   can't be set apart from its parent's.

-- ------------------------------------------------------------------ saved views: the plan facet

create or replace function private.prepare_issue_view()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facet record;
  item jsonb;
begin
  if tg_op = 'INSERT' then
    select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;
    if new.team_id is null then raise exception 'Workspace not found' using errcode = '23503'; end if;
    if (select count(*) from public.issue_views v where v.workspace_id = new.workspace_id and v.owner_id = new.owner_id) >= 50 then
      raise exception 'You can have at most 50 views in a workspace' using errcode = '54000';
    end if;
  end if;
  new.name := btrim(new.name);
  if jsonb_typeof(new.filters) <> 'object' then raise exception 'Invalid view filters' using errcode = '22023'; end if;
  for facet in select key, value from jsonb_each(new.filters) loop
    if facet.key not in ('status', 'priority', 'assignee', 'label', 'plan', 'cycle', 'repo')
       or jsonb_typeof(facet.value) <> 'array'
       or jsonb_array_length(facet.value) > 50 then
      raise exception 'Invalid view filters' using errcode = '22023';
    end if;
    for item in select value from jsonb_array_elements(facet.value) loop
      if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 64 then
        raise exception 'Invalid view filters' using errcode = '22023';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;

-- ------------------------------------------------------------------ sub-issues follow their parent's plan

-- Before a sub-issue is saved: its plan is its parent's.
create function private.sub_issue_takes_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    new.plan_id := (select p.plan_id from public.issues p where p.id = new.parent_id);
  end if;
  return new;
end;
$$;

revoke all on function private.sub_issue_takes_plan() from public, anon, authenticated;
create trigger sub_issue_takes_plan before insert or update of parent_id, plan_id on public.issues
  for each row execute function private.sub_issue_takes_plan();

-- After an issue's plan changes: its sub-issues follow (their own update does the same for theirs).
create function private.sub_issues_follow_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.issues set plan_id = new.plan_id
   where parent_id = new.id and plan_id is distinct from new.plan_id;
  return null;
end;
$$;

revoke all on function private.sub_issues_follow_plan() from public, anon, authenticated;
create trigger sub_issues_follow_plan after update of plan_id on public.issues
  for each row when (old.plan_id is distinct from new.plan_id)
  execute function private.sub_issues_follow_plan();

-- Sub-issues made before this take their parent's plan now, every level (until nothing differs).
do $$
begin
  loop
    update public.issues c set plan_id = p.plan_id
      from public.issues p
     where c.parent_id = p.id and c.plan_id is distinct from p.plan_id;
    exit when not found;
  end loop;
end;
$$;
