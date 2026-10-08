-- Who replied to a meeting invite, Teams-style: each person's Google Calendar
-- RSVP shown on the meeting page.
--
-- Privacy: Google reports attendees by email address. Emails are resolved to
-- DevDock profiles inside set_live_session_rsvps() and only the profile id is
-- stored, so a student's address is never written to a readable table. That
-- keeps the rule live_session_invitees() already follows.

create table public.live_session_rsvps (
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- Google's values; 'needsAction' means invited but no reply yet.
  status     text not null check (status in ('accepted', 'declined', 'tentative', 'needsAction')),
  updated_at timestamptz not null default now(),

  primary key (session_id, user_id)
);

comment on table public.live_session_rsvps is 'Per-person replies to a meeting invite, mirrored from the organizer''s Google Calendar event.';

create index live_session_rsvps_user_idx on public.live_session_rsvps (user_id);

-- ---------------------------------------------------------------------------
-- Privileges + RLS: readable by anyone who can see the meeting; written only by
-- the function below (clients get no insert/update/delete).
-- ---------------------------------------------------------------------------
revoke all on table public.live_session_rsvps from anon, authenticated;
grant select on table public.live_session_rsvps to authenticated;

alter table public.live_session_rsvps enable row level security;

create policy "Readers can see meeting replies"
  on public.live_session_rsvps for select to authenticated
  using (
    exists (
      select 1
      from public.live_sessions s
      where s.id = session_id and private.can_read_document(s.team_id, s.workspace_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Replaces the stored replies for one meeting.
--
-- p_responses: [{"email": "...", "status": "accepted"}, …] straight from the
-- Google event. Addresses that don't belong to someone in the meeting's
-- audience are ignored, and no address is kept.
-- ---------------------------------------------------------------------------
create function public.set_live_session_rsvps(p_session_id uuid, p_responses jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.live_sessions;
  v_count integer;
begin
  select * into v_session from public.live_sessions where id = p_session_id;
  if not found or not private.can_write_document(v_session.team_id, v_session.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_responses) <> 'array' or jsonb_array_length(p_responses) > 500 then
    raise exception 'Bad replies' using errcode = '22023';
  end if;

  with replies as (
    select lower(btrim(r.value ->> 'email')) as email, r.value ->> 'status' as status
    from jsonb_array_elements(p_responses) as r
    where r.value ->> 'status' in ('accepted', 'declined', 'tentative', 'needsAction')
  ),
  resolved as (
    -- Only people the meeting is actually for; the email is dropped here.
    select distinct on (u.id) u.id as user_id, replies.status
    from replies
    join auth.users u on lower(u.email) = replies.email
    where (
      v_session.workspace_id is null and exists (
        select 1 from public.team_members m where m.team_id = v_session.team_id and m.user_id = u.id)
    ) or (
      v_session.workspace_id is not null and exists (
        select 1 from public.workspace_members m where m.workspace_id = v_session.workspace_id and m.user_id = u.id)
    )
  ),
  cleared as (
    delete from public.live_session_rsvps
    where session_id = p_session_id and user_id not in (select user_id from resolved)
    returning 1
  ),
  saved as (
    insert into public.live_session_rsvps (session_id, user_id, status, updated_at)
    select p_session_id, resolved.user_id, resolved.status, now() from resolved
    on conflict (session_id, user_id)
      do update set status = excluded.status, updated_at = excluded.updated_at
    returning 1
  )
  select count(*) into v_count from saved;

  return v_count;
end;
$$;

revoke all on function public.set_live_session_rsvps(uuid, jsonb) from public, anon;
grant execute on function public.set_live_session_rsvps(uuid, jsonb) to authenticated;
