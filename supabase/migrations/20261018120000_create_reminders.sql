-- Reminders: private, time-based notes to self ("Review CAP-12, tomorrow at 9"). Each belongs to one
-- person in one group, optionally about a workspace and an issue in it. A pg_cron job checks once a
-- minute for reminders that are due and puts one notification in the owner's bell for each.
-- Design record: docs/REMINDERS.md.

create type public.reminder_status as enum ('pending', 'completed', 'cancelled');

create table public.reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  team_id      uuid not null,
  workspace_id uuid,
  issue_id     uuid,
  title        text not null,
  notes        text,
  remind_at    timestamptz not null,
  status       public.reminder_status not null default 'pending',
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- When the bell got its notification. Set only by private.fire_due_reminders().
  notified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Leaving the group removes your reminders in it.
  constraint reminders_member_fkey
    foreign key (team_id, user_id) references public.team_members (team_id, user_id) on delete cascade,
  -- A deleted workspace or issue leaves the reminder, without it.
  constraint reminders_workspace_fkey
    foreign key (workspace_id, team_id) references public.workspaces (id, team_id) on delete set null (workspace_id),
  constraint reminders_issue_fkey
    foreign key (issue_id, workspace_id) references public.issues (id, workspace_id) on delete set null (issue_id),
  constraint reminders_title_length check (char_length(title) between 1 and 200),
  constraint reminders_notes_length check (char_length(notes) <= 2000)
);

comment on table public.reminders is 'A reminder to self at a time, private to its owner. Fired into the bell by private.fire_due_reminders().';

-- The Reminders page: one person's reminders in one group, by status, soonest first.
create index reminders_owner_idx on public.reminders (user_id, team_id, status, remind_at);
-- The scheduler: only what is still waiting to fire.
create index reminders_due_idx on public.reminders (remind_at) where status = 'pending' and notified_at is null;
-- The cascades from deleted workspaces and issues.
create index reminders_workspace_idx on public.reminders (workspace_id) where workspace_id is not null;
create index reminders_issue_idx on public.reminders (issue_id) where issue_id is not null;

create trigger set_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();

-- The reminder rules, wherever a write comes from (the app now, the AI agent later):
-- - the workspace and issue must be ones the caller can open; an issue brings its workspace, and
--   choosing another workspace drops the issue;
-- - changing the status stamps completed_at / cancelled_at;
-- - moving the time of a reminder that already fired into the future lets it fire again (a snooze).
-- Clearing a workspace or issue (including the cascades above, which run as whoever deleted it)
-- needs no check.
create function private.check_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.notes := nullif(btrim(new.notes), '');

  -- Moving a reminder to another workspace (or none, also when the workspace is deleted) drops its issue.
  if tg_op = 'UPDATE' and new.issue_id is not distinct from old.issue_id and new.workspace_id is distinct from old.workspace_id then
    new.issue_id := null;
  end if;

  if new.issue_id is not null and (tg_op = 'INSERT' or new.issue_id is distinct from old.issue_id) then
    select i.workspace_id into new.workspace_id from public.issues i where i.id = new.issue_id and i.team_id = new.team_id;
    if new.workspace_id is null or not private.can_view_workspace(new.workspace_id) then
      raise exception 'Issue not found' using errcode = '23503';
    end if;
  elsif new.workspace_id is not null and (tg_op = 'INSERT' or new.workspace_id is distinct from old.workspace_id) then
    if not private.can_view_workspace(new.workspace_id) then
      raise exception 'Workspace not found' using errcode = '23503';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if (select count(*) from public.reminders r
        where r.user_id = new.user_id and r.team_id = new.team_id and r.status = 'pending') >= 500 then
      raise exception 'You can have at most 500 open reminders in a group' using errcode = '54000';
    end if;
    new.status := 'pending';
    new.completed_at := null;
    new.cancelled_at := null;
    new.notified_at := null;
  else
    if new.status is distinct from old.status then
      new.completed_at := case when new.status = 'completed' then now() end;
      new.cancelled_at := case when new.status = 'cancelled' then now() end;
    end if;
    if new.remind_at is distinct from old.remind_at and new.remind_at > now() then
      new.notified_at := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.check_reminder() from public, anon, authenticated;

create trigger check_reminder before insert or update on public.reminders
  for each row execute function private.check_reminder();

revoke all on table public.reminders from anon, authenticated;
grant select on table public.reminders to authenticated;
grant insert (team_id, workspace_id, issue_id, title, notes, remind_at) on table public.reminders to authenticated;
grant update (workspace_id, issue_id, title, notes, remind_at, status) on table public.reminders to authenticated;
-- No delete: cancelling keeps the history. Leaving the group removes them (reminders_member_fkey).

alter table public.reminders enable row level security;

-- Private: nobody else reads them, group owners and admins included.
create policy "People read their own reminders"
  on public.reminders for select to authenticated
  using (user_id = (select auth.uid()));

create policy "People create their own reminders"
  on public.reminders for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_team_member(team_id));

create policy "People edit their own reminders"
  on public.reminders for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------
-- Notifications: a reminder notification points at its reminder.

alter table public.notifications add column reminder_id uuid references public.reminders (id) on delete cascade;
create index notifications_reminder_idx on public.notifications (reminder_id) where reminder_id is not null;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mention', 'message', 'thread', 'call', 'reminder'));

-- Completing or cancelling a reminder clears its notification from the bell.
create function private.clear_reminder_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n set read_at = now()
  where n.reminder_id = new.id and n.read_at is null;
  return null;
end;
$$;
revoke all on function private.clear_reminder_notifications() from public, anon, authenticated;

create trigger clear_reminder_notifications after update of status on public.reminders
  for each row when (old.status = 'pending' and new.status <> 'pending')
  execute function private.clear_reminder_notifications();

-- ---------------------------------------------------------------------------------------------------
-- Delivery: once a minute, every pending reminder that is due and hasn't fired gets one notification.
--
-- Claiming (for update skip locked), marking and notifying are one statement, so they commit together:
-- a failed insert leaves the reminder unmarked for the next run, and two overlapping runs never take
-- the same reminder. The dedupe key (unique per recipient) includes the time, so a run can never
-- notify twice for one time, while a snoozed reminder fires again at its new time. Overdue reminders
-- (the job was down) fire once when it runs again.

create function private.fire_due_reminders(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fired integer;
begin
  with due as (
    select r.id from public.reminders r
    where r.status = 'pending' and r.notified_at is null and r.remind_at <= now()
    order by r.remind_at
    limit p_limit
    for update skip locked
  ), fired as (
    update public.reminders r set notified_at = now()
    from due where r.id = due.id
    returning r.id, r.user_id, r.team_id, r.remind_at
  ), sent as (
    insert into public.notifications (team_id, recipient_id, reminder_id, kind, dedupe_key)
    select f.team_id, f.user_id, f.id, 'reminder', 'reminder:' || f.id::text || ':' || floor(extract(epoch from f.remind_at))::bigint::text
    from fired f
    on conflict (recipient_id, dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_fired from fired;
  return v_fired;
end;
$$;
revoke all on function private.fire_due_reminders(integer) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

-- cron.schedule with an existing name replaces that job, so re-running this is safe.
select cron.schedule('fire-due-reminders', '* * * * *', 'select private.fire_due_reminders()');
-- A run a minute writes ~1,440 history rows a day; keep two days of them.
select cron.schedule('purge-cron-history', '17 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$);

-- ---------------------------------------------------------------------------------------------------
-- Live updates: the owner's other tabs see creates, edits and the scheduler marking a reminder fired.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reminders') then
    alter publication supabase_realtime add table public.reminders;
  end if;
end;
$$;
