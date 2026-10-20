-- Meeting notes: private notes a person keeps on one meeting, optionally with a reminder.
-- A note is not a reminder: it is text for the meeting that can *also* nudge you, either before
-- the meeting (a notification in the bell, fired by pg_cron) or during it (a pop-up the app shows
-- while the call is open; nothing is stored for that, the browser decides from the meeting's start).
--
-- Private to the person who wrote it, group owners and admins included. They are tied to one
-- meeting (one occurrence of a repeating series). Design record: docs/MEETING_NOTES.md.

create table public.meeting_notes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  team_id        uuid not null,
  session_id     uuid not null references public.live_sessions (id) on delete cascade,
  body           text not null,
  -- 'none' just a note; 'before' = N minutes before the meeting starts; 'during' = N minutes after it starts.
  remind_when    text not null default 'none',
  remind_minutes integer,
  -- When the bell got its 'before' notification. Set only by the scheduler; cleared when the
  -- reminder or the meeting's start changes.
  notified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Leaving the group removes your notes in it.
  constraint meeting_notes_member_fkey
    foreign key (team_id, user_id) references public.team_members (team_id, user_id) on delete cascade,
  constraint meeting_notes_body_length check (char_length(body) between 1 and 2000),
  constraint meeting_notes_remind check (
    (remind_when = 'none' and remind_minutes is null)
    or (remind_when = 'before' and coalesce(remind_minutes between 0 and 10080, false))
    or (remind_when = 'during' and coalesce(remind_minutes between 0 and 720, false))
  )
);

comment on table public.meeting_notes is 'A private note on one meeting, optionally reminding its owner before or during it. Docs: docs/MEETING_NOTES.md.';

-- The notes panel: one person's notes on one meeting.
create index meeting_notes_session_idx on public.meeting_notes (session_id, user_id, created_at);
create index meeting_notes_member_idx on public.meeting_notes (team_id, user_id);
-- The scheduler: only 'before' notes still waiting to fire.
create index meeting_notes_due_idx on public.meeting_notes (session_id) where remind_when = 'before' and notified_at is null;

create trigger set_updated_at before update on public.meeting_notes
  for each row execute function public.set_updated_at();

create function private.check_meeting_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  if tg_op = 'INSERT' then
    if (select count(*) from public.meeting_notes n where n.user_id = new.user_id and n.session_id = new.session_id) >= 100 then
      raise exception 'You can keep at most 100 notes on a meeting' using errcode = '54000';
    end if;
    new.notified_at := null;
  elsif new.remind_when is distinct from old.remind_when or new.remind_minutes is distinct from old.remind_minutes then
    -- A changed reminder can fire again.
    new.notified_at := null;
  end if;
  return new;
end;
$$;
revoke all on function private.check_meeting_note() from public, anon, authenticated;

create trigger check_meeting_note before insert or update on public.meeting_notes
  for each row execute function private.check_meeting_note();

revoke all on table public.meeting_notes from anon, authenticated;
grant select on table public.meeting_notes to authenticated;
grant insert (team_id, session_id, body, remind_when, remind_minutes) on table public.meeting_notes to authenticated;
grant update (body, remind_when, remind_minutes) on table public.meeting_notes to authenticated;
grant delete on table public.meeting_notes to authenticated;

alter table public.meeting_notes enable row level security;

-- Private: nobody else reads them, group owners and admins included.
create policy "People read their own meeting notes"
  on public.meeting_notes for select to authenticated
  using (user_id = (select auth.uid()));

-- The meeting must be one the person can open (live_sessions' own RLS decides, since this subquery
-- runs as them) and in the same group.
create policy "People add notes to meetings they can open"
  on public.meeting_notes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.live_sessions s where s.id = session_id and s.team_id = meeting_notes.team_id)
  );

create policy "People edit their own meeting notes"
  on public.meeting_notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "People delete their own meeting notes"
  on public.meeting_notes for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------
-- The bell: a 'before' reminder is a notification that points at its note.

alter table public.notifications add column meeting_note_id uuid references public.meeting_notes (id) on delete cascade;
create index notifications_meeting_note_idx on public.notifications (meeting_note_id) where meeting_note_id is not null;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mention', 'message', 'thread', 'call', 'reminder', 'meeting_note'));

-- Delivery, once a minute: a 'before' note whose time has come and whose meeting hasn't ended gets one
-- notification. Claiming, marking and notifying are one statement (see fire_due_reminders), and the
-- dedupe key carries the due time, so a moved meeting notifies again at its new time and nothing
-- notifies twice for one.
create function private.fire_due_meeting_notes(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fired integer;
begin
  with due as (
    select n.id, s.starts_at - make_interval(mins => n.remind_minutes) as due_at
    from public.meeting_notes n
    join public.live_sessions s on s.id = n.session_id
    where n.remind_when = 'before' and n.notified_at is null
      and s.starts_at - make_interval(mins => n.remind_minutes) <= now()
      and s.ends_at > now()
    order by 2
    limit p_limit
    for update of n skip locked
  ), fired as (
    update public.meeting_notes n set notified_at = now()
    from due where n.id = due.id
    returning n.id, n.user_id, n.team_id, due.due_at
  ), sent as (
    insert into public.notifications (team_id, recipient_id, meeting_note_id, kind, dedupe_key)
    select f.team_id, f.user_id, f.id, 'meeting_note', 'meeting_note:' || f.id::text || ':' || floor(extract(epoch from f.due_at))::bigint::text
    from fired f
    on conflict (recipient_id, dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_fired from fired;
  return v_fired;
end;
$$;
revoke all on function private.fire_due_meeting_notes(integer) from public, anon, authenticated;

select cron.schedule('fire-due-meeting-notes', '* * * * *', 'select private.fire_due_meeting_notes()');

-- A meeting moved to another time lets its notes' 'before' reminders fire again.
create function private.reset_meeting_note_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meeting_notes set notified_at = null
  where session_id = new.id and remind_when = 'before' and notified_at is not null;
  return null;
end;
$$;
revoke all on function private.reset_meeting_note_reminders() from public, anon, authenticated;

create trigger reset_meeting_note_reminders after update of starts_at on public.live_sessions
  for each row when (old.starts_at is distinct from new.starts_at)
  execute function private.reset_meeting_note_reminders();
