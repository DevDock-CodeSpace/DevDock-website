-- Pin cycles to the sidebar, like saved views: a specific cycle, or "Current cycle" (whichever cycle is
-- running now, so the pin never goes stale when the next cycle starts).

alter table public.issue_pins
  add column cycle_id uuid references public.issue_cycles (id) on delete cascade;

alter table public.issue_pins drop constraint issue_pins_kind_check;
alter table public.issue_pins add constraint issue_pins_kind_check
  check (kind in ('view', 'person', 'tab', 'cycle', 'current_cycle'));

alter table public.issue_pins drop constraint issue_pins_target;
alter table public.issue_pins add constraint issue_pins_target check (
  (kind = 'view' and view_id is not null and person_id is null and tab is null and cycle_id is null)
  or (kind = 'person' and person_id is not null and view_id is null and tab is null and cycle_id is null)
  or (kind = 'tab' and tab is not null and view_id is null and person_id is null and cycle_id is null)
  or (kind = 'cycle' and cycle_id is not null and view_id is null and person_id is null and tab is null)
  or (kind = 'current_cycle' and view_id is null and person_id is null and tab is null and cycle_id is null)
);

create unique index issue_pins_cycle_idx on public.issue_pins (user_id, cycle_id) where kind = 'cycle';
create unique index issue_pins_current_cycle_idx on public.issue_pins (user_id, workspace_id) where kind = 'current_cycle';

grant insert (cycle_id) on table public.issue_pins to authenticated;

-- A pinned cycle must be one in the pin's own workspace (cycles are visible to everyone who can see the
-- workspace; RLS applies inside this subquery).
drop policy "People pin what they can see" on public.issue_pins;
create policy "People pin what they can see"
  on public.issue_pins for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_view_workspace(workspace_id)
    and (kind <> 'view' or exists (
      select 1 from public.issue_views v where v.id = issue_pins.view_id and v.workspace_id = issue_pins.workspace_id
    ))
    and (kind <> 'cycle' or exists (
      select 1 from public.issue_cycles c where c.id = issue_pins.cycle_id and c.workspace_id = issue_pins.workspace_id
    ))
  );
