-- Let people who share a workspace see each other's profile (name, avatar),
-- so member lists can show who is who.
--
-- Narrow on purpose: no shared workspace → no visibility. The existing
-- "read own profile" policy stays; policies are OR-ed together. Profiles are
-- still only editable by their owner.

create function private.shares_workspace_with(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user
  );
$$;

revoke execute on function private.shares_workspace_with(uuid) from public, anon;
grant execute on function private.shares_workspace_with(uuid) to authenticated;

create policy "Users can read profiles of workspace peers"
  on public.profiles
  for select
  to authenticated
  using (private.shares_workspace_with(id));
