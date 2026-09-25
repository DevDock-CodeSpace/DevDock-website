-- 20260925104936_live_session_moderator was recorded as applied on the hosted
-- project while its file was still empty, so the function never got created
-- there. Create it here (idempotently) instead of editing the old file.

-- Whether the caller moderates a live session: may edit it (group owners/
-- admins; workspace leads for their workspace). Used by the jaas-token Edge
-- Function to decide the Jitsi moderator flag. False when the session isn't
-- visible to the caller.
create or replace function public.can_moderate_live_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.can_read_document(s.team_id, s.workspace_id)
       and private.can_write_document(s.team_id, s.workspace_id)
    from public.live_sessions s
    where s.id = p_session_id
  ), false);
$$;

revoke all on function public.can_moderate_live_session(uuid) from public, anon;
grant execute on function public.can_moderate_live_session(uuid) to authenticated;
