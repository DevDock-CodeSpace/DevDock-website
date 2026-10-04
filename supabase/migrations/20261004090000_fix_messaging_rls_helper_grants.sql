-- RLS policies execute as the requesting role, so authenticated must be able
-- to invoke these security-definer predicates. The functions still perform
-- the authorization checks and remain unavailable to anon/public.
grant execute on function private.can_read_conversation(uuid) to authenticated;
grant execute on function private.can_manage_conversation(uuid) to authenticated;
