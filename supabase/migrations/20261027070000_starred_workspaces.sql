-- Starred (owner's choice, 2026-10-27): one ☆ and one sidebar list, "Starred", for everything you keep
-- at hand. Workspace pins (which kept a workspace at the top of its sidebar section) become stars of
-- kind 'workspace' in issue_pins, beside starred issues, plans, views, people, tabs and sprints.
--
-- workspace_pins stays for now, unused by the new client, so tabs opened before this deploy keep
-- working; drop it in a later migration.

alter table public.issue_pins drop constraint issue_pins_kind_check;
alter table public.issue_pins add constraint issue_pins_kind_check
  check (kind in ('view', 'person', 'tab', 'cycle', 'current_cycle', 'issue', 'plan', 'my_issues', 'workspace'));

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
  or (kind = 'workspace' and workspace_id is not null and view_id is null and person_id is null and tab is null and cycle_id is null and issue_id is null and plan_id is null)
);

create unique index issue_pins_workspace_key on public.issue_pins (user_id, workspace_id) where kind = 'workspace';

-- The 30-item limit now counts every kind of star, so the words say "star".
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
    raise exception 'You can star at most 30 items' using errcode = '54000';
  end if;
  new.position := coalesce((select max(p.position) from public.issue_pins p where p.user_id = new.user_id and p.team_id = new.team_id), 0) + 1;
  return new;
end;
$$;

-- Existing workspace pins become stars, after what each person has already starred, oldest pin
-- first. One at a time, so the trigger numbers them and anyone already at 30 keeps what fits.
do $$
declare
  pin record;
begin
  for pin in
    select wp.user_id, wp.workspace_id
    from public.workspace_pins wp
    where not exists (
      select 1 from public.issue_pins ip where ip.user_id = wp.user_id and ip.kind = 'workspace' and ip.workspace_id = wp.workspace_id
    )
    order by wp.pinned_at
  loop
    begin
      insert into public.issue_pins (user_id, kind, workspace_id) values (pin.user_id, 'workspace', pin.workspace_id);
    -- At the limit, or no longer in that group: leave that one out.
    exception when sqlstate '54000' or sqlstate '23503' then
      null;
    end;
  end loop;
end;
$$;
