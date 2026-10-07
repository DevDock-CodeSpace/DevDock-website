-- Recurring meetings: a series is a set of ordinary live_sessions rows that
-- share a series_id (each keeps its own room, status and edits). Created
-- atomically by create_live_series(); at most 60 per series.
--
-- A series' occurrences share one Google Calendar event (calendar_event_id is
-- the same on every row), so the organizer's calendar shows one recurring event.

alter table public.live_sessions add column series_id uuid;

create index live_sessions_series_idx on public.live_sessions (series_id, starts_at) where series_id is not null;

-- Clients may point calendar_event_id at a whole series (update by series_id);
-- series_id itself is only ever set by create_live_series().
create function public.create_live_series(
  p_team_id uuid,
  p_workspace_id uuid,
  p_title text,
  p_description text,
  p_starts timestamptz[],
  p_duration_minutes integer
)
returns table (id uuid, series_id uuid, starts_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null or not private.can_write_document(p_team_id, p_workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_starts is null or cardinality(p_starts) not between 1 and 60 then
    raise exception 'A series has 1 to 60 meetings' using errcode = '23514';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 5 and 720 then
    raise exception 'Meetings last 5 minutes to 12 hours' using errcode = '23514';
  end if;

  return query
    insert into public.live_sessions as s (team_id, workspace_id, title, description, starts_at, ends_at, series_id, created_by)
    select p_team_id, p_workspace_id, p_title, nullif(btrim(p_description), ''), t,
           t + make_interval(mins => p_duration_minutes),
           case when cardinality(p_starts) > 1 then v_series end,
           (select auth.uid())
    from unnest(p_starts) as t
    returning s.id, s.series_id, s.starts_at;
end;
$$;

revoke all on function public.create_live_series(uuid, uuid, text, text, timestamptz[], integer) from public, anon;
grant execute on function public.create_live_series(uuid, uuid, text, text, timestamptz[], integer) to authenticated;
