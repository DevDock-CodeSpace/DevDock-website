-- ninety-sync: the function runs its sync as the service role, which teams.enabled_features answers
-- with {} (it answers members and the platform admin only). This tells the function whether a group
-- is connected and has the ninety_sync flag. Service role only.

create function public.ninety_team_active(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.ninety_active(p_team);
$$;

revoke execute on function public.ninety_team_active(uuid) from public, anon, authenticated;
grant execute on function public.ninety_team_active(uuid) to service_role;
