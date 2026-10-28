-- ninety-sync fix: the select policies on ninety_connections and ninety_workspace_teams called
-- private.feature_enabled, which signed-in people may not execute (it would tell anyone any group's
-- flags), so reading them failed with "permission denied" and took Group settings down with it.
-- They now call one helper that answers only about groups the caller administers.

create function private.ninety_admin_sees(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_team_admin(p_team) and private.feature_enabled(p_team, 'ninety_sync');
$$;

revoke execute on function private.ninety_admin_sees(uuid) from public, anon;
grant execute on function private.ninety_admin_sees(uuid) to authenticated;

drop policy "Group admins see their Ninety connection" on public.ninety_connections;
drop policy "Group admins see their project links" on public.ninety_workspace_teams;

create policy "Group admins see their Ninety connection" on public.ninety_connections
  for select to authenticated
  using ((select private.ninety_admin_sees(team_id)));
create policy "Group admins see their project links" on public.ninety_workspace_teams
  for select to authenticated
  using ((select private.ninety_admin_sees(team_id)));
