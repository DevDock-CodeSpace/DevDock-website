-- The Meetings list now pages through meetings in two sections, split on ends_at
-- (upcoming: ends_at > now, past: ends_at <= now) and ordered by starts_at.
-- Index the split for both scopes, like live_sessions_team_starts_idx and
-- live_sessions_workspace_starts_idx do for the order.
create index if not exists live_sessions_team_ends_idx on public.live_sessions (team_id, ends_at);
create index if not exists live_sessions_workspace_ends_idx on public.live_sessions (workspace_id, ends_at) where workspace_id is not null;
