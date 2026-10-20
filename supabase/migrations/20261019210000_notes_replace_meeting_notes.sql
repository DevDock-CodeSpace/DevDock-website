-- Notes. Decision (2026-10-19): one feature, not two. A reminder is a note that has a time; a note
-- doesn't need one. So:
--   1. The meeting-only notes table from 20261019190000 is removed (it never shipped, and is empty).
--   2. public.reminders becomes the notes table: remind_at is optional. A note without a time just
--      sits in the list; with one, the scheduler (private.fire_due_reminders) puts it in the bell at
--      that time and the app pops it up. Nothing else changes: the same owner-only RLS, grants,
--      status (pending / completed / cancelled = open / done / archived) and delivery.
-- The table and functions keep their `reminders` names (the UI says Notes, like "group" for team).

-- ---------------------------------------------------------------------------------------------------
-- 1. Remove meeting notes.

select cron.unschedule('fire-due-meeting-notes');
drop trigger if exists reset_meeting_note_reminders on public.live_sessions;
drop function if exists private.reset_meeting_note_reminders();
drop function if exists private.fire_due_meeting_notes(integer);
drop table if exists public.meeting_notes cascade;
drop function if exists private.check_meeting_note();

delete from public.notifications where kind = 'meeting_note';
alter table public.notifications drop column if exists meeting_note_id;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mention', 'message', 'thread', 'call', 'reminder'));

-- ---------------------------------------------------------------------------------------------------
-- 2. A note may have no time.

alter table public.reminders alter column remind_at drop not null;

comment on table public.reminders is 'A note to self, private to its owner, optionally with a time (remind_at) at which it is fired into the bell by private.fire_due_reminders(). The UI calls these Notes.';

-- check_reminder, as before, except that clearing the time (or moving it later) re-arms the note:
-- a note that already fired and gets a new time fires again then.
create or replace function private.check_reminder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.notes := nullif(btrim(new.notes), '');

  -- Moving a note to another workspace (or none, also when the workspace is deleted) drops its issue.
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
      raise exception 'You can have at most 500 open notes in a group' using errcode = '54000';
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
    if new.remind_at is distinct from old.remind_at and (new.remind_at is null or new.remind_at > now()) then
      new.notified_at := null;
    end if;
  end if;
  return new;
end;
$$;
