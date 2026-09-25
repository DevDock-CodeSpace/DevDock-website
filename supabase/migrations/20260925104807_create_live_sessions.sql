-- Live sessions: scheduled video calls (Jitsi, via JaaS), group-wide or in
-- one workspace, with an optional Google Calendar event.
--
-- Security: the same rules as documents (private.can_read_document /
-- can_write_document):
--   * see and join: group-wide sessions, any group member; workspace
--     sessions, that workspace's members and group owners/admins
--   * schedule, edit, cancel: group owners/admins; workspace leads for their
--     workspace
-- room_name is random and set by the database. The meeting itself is only
-- reachable with a JaaS token from the jaas-token Edge Function, which checks
-- read access first.

create table public.live_sessions (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams (id) on delete cascade,
  workspace_id      uuid,
  title             text not null,
  description       text,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  -- Unguessable Jitsi room name (letters/digits only).
  room_name         text not null default replace(gen_random_uuid()::text, '-', ''),
  -- The organizer's Google Calendar event, when one was created.
  calendar_event_id text,
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint live_sessions_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint live_sessions_description_length check (description is null or char_length(description) <= 5000),
  constraint live_sessions_times check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours'),
  constraint live_sessions_room_unique unique (room_name),
  constraint live_sessions_workspace_team_fkey foreign key (workspace_id, team_id)
    references public.workspaces (id, team_id) on delete cascade
);

comment on table public.live_sessions is 'Scheduled live video sessions (Jitsi/JaaS), group-wide or per workspace.';

create index live_sessions_team_starts_idx on public.live_sessions (team_id, starts_at);
create index live_sessions_workspace_starts_idx on public.live_sessions (workspace_id, starts_at) where workspace_id is not null;
create index live_sessions_created_by_idx on public.live_sessions (created_by);

create trigger set_updated_at
  before update on public.live_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Who gets the calendar invite: everyone in the session's audience (the whole
-- group for group-wide sessions, the workspace's members otherwise), except
-- the caller. Only someone who may edit the session can ask, so emails are
-- never exposed to students.
-- ---------------------------------------------------------------------------
create function public.live_session_invitees(p_session_id uuid)
returns table (email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.live_sessions;
begin
  select * into s from public.live_sessions where id = p_session_id;
  if not found or not private.can_write_document(s.team_id, s.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select distinct u.email::text
    from auth.users u
    where u.id <> (select auth.uid())
      and u.email is not null
      and (
        (s.workspace_id is null and exists (
          select 1 from public.team_members m where m.team_id = s.team_id and m.user_id = u.id))
        or (s.workspace_id is not null and exists (
          select 1 from public.workspace_members m where m.workspace_id = s.workspace_id and m.user_id = u.id))
      );
end;
$$;

revoke all on function public.live_session_invitees(uuid) from public, anon;
grant execute on function public.live_session_invitees(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.live_sessions from anon, authenticated;
grant select, delete on table public.live_sessions to authenticated;
grant insert (team_id, workspace_id, title, description, starts_at, ends_at)
  on table public.live_sessions to authenticated;
grant update (title, description, starts_at, ends_at, calendar_event_id)
  on table public.live_sessions to authenticated;

alter table public.live_sessions enable row level security;

create policy "Readers can see live sessions"
  on public.live_sessions for select to authenticated
  using (private.can_read_document(team_id, workspace_id));

create policy "Writers can schedule live sessions"
  on public.live_sessions for insert to authenticated
  with check (private.can_write_document(team_id, workspace_id));

create policy "Writers can edit live sessions"
  on public.live_sessions for update to authenticated
  using (private.can_write_document(team_id, workspace_id))
  with check (private.can_write_document(team_id, workspace_id));

create policy "Writers can cancel live sessions"
  on public.live_sessions for delete to authenticated
  using (private.can_write_document(team_id, workspace_id));
