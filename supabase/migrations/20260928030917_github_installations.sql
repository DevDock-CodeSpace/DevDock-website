-- GitHub, phase 9b: connect a group to the DevDock GitHub App.
--
-- A group owner/admin installs the App on GitHub (choosing which repos it may
-- see). GitHub sends them back with a one-time code; the `github` Edge
-- Function checks with GitHub that this person really can access that
-- installation, then records it here. Repos picked from GitHub carry their
-- GitHub id and installation; repos typed in by name before connecting are
-- matched up at connect time.
--
-- Security:
--   * see a group's connections: any group member
--   * disconnect: group owners/admins
--   * connect: only the Edge Function (service role), after verifying with
--     GitHub. Clients have no insert/update grants here, and none on
--     repos.github_repo_id / repos.installation_id either.
--   * start a connection: public.start_github_connect(), owners/admins only;
--     its one-time state ties GitHub's redirect back to that person and group.

-- ---------------------------------------------------------------------------
-- github_installations
-- ---------------------------------------------------------------------------
create table public.github_installations (
  team_id         uuid not null references public.teams (id) on delete cascade,
  installation_id bigint not null,
  -- The GitHub user or organization the App is installed on.
  account_login   text not null,
  account_type    text not null,
  connected_by    uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (team_id, installation_id),

  constraint github_installations_account_type check (account_type in ('User', 'Organization'))
);

comment on table public.github_installations is 'A GitHub App installation connected to a group. Written only by the github Edge Function.';

create index github_installations_installation_idx on public.github_installations (installation_id);
create index github_installations_connected_by_idx on public.github_installations (connected_by);

-- ---------------------------------------------------------------------------
-- repos: GitHub identity (set only by the Edge Function)
-- ---------------------------------------------------------------------------
alter table public.repos
  add column github_repo_id  bigint,
  add column installation_id bigint,
  -- Disconnecting keeps the repo (and its issues) but marks it not connected.
  add constraint repos_installation_fkey foreign key (team_id, installation_id)
    references public.github_installations (team_id, installation_id) on delete set null (installation_id);

comment on column public.repos.github_repo_id is 'GitHub''s repository id (stable across renames and transfers). Null for repos added by name only.';
comment on column public.repos.installation_id is 'The connected installation that can reach this repo; null = not connected.';

create unique index repos_team_github_idx on public.repos (team_id, github_repo_id) where github_repo_id is not null;
create index repos_installation_idx on public.repos (team_id, installation_id);

-- ---------------------------------------------------------------------------
-- One-time state for the install round trip
-- ---------------------------------------------------------------------------
-- RLS on with no policies: only the service role (the Edge Function) and the
-- security definer function below touch it.
create table public.github_connect_states (
  state      uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.github_connect_states is 'One-time states for GitHub App installs (valid 30 minutes). Service role only.';

create index github_connect_states_team_idx on public.github_connect_states (team_id);
create index github_connect_states_user_idx on public.github_connect_states (user_id);

revoke all on table public.github_connect_states from anon, authenticated;
alter table public.github_connect_states enable row level security;

create function public.start_github_connect(p_team_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_state uuid;
begin
  if not private.is_team_admin(p_team_id) then
    raise exception 'Only group owners and admins can connect GitHub' using errcode = '42501';
  end if;
  delete from public.github_connect_states s where s.created_at < now() - interval '1 hour';
  insert into public.github_connect_states (team_id, user_id)
  values (p_team_id, (select auth.uid()))
  returning state into new_state;
  return new_state;
end;
$$;

revoke all on function public.start_github_connect(uuid) from public, anon;
grant execute on function public.start_github_connect(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.github_installations from anon, authenticated;
grant select, delete on table public.github_installations to authenticated;

alter table public.github_installations enable row level security;

create policy "Group members can see GitHub connections"
  on public.github_installations for select to authenticated
  using (private.is_team_member(team_id));

create policy "Group owners and admins can disconnect GitHub"
  on public.github_installations for delete to authenticated
  using (private.is_team_admin(team_id));
