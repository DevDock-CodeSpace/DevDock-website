-- Configurable tools ("modules") per workspace.
--
-- A workspace enables a subset of tools; its navigation is generated from
-- these rows (Overview and Members are always present and aren't modules).
-- Workspace type only picks the *default* set at creation time.
--
-- Concept for later phases: team-level tools (Team Docs, Team Live, …) show
-- everything in the team; a workspace's tab shows only content assigned to that
-- workspace. This migration only records which tools a workspace has enabled.
--
-- Security:
--   * read:   anyone who can see the workspace (team owner/admin, or a
--             workspace member) — same audience as the workspace row itself
--   * change: team owner/admin or the workspace's lead (same as editing the
--             workspace), via INSERT/DELETE; no UPDATE (a row is just a flag)

create type public.workspace_module as enum (
  'issues', 'docs', 'diagrams', 'github', 'live', 'learning', 'exercises', 'resources'
);

create table public.workspace_modules (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  module       public.workspace_module not null,
  created_at   timestamptz not null default now(),

  -- Unique (workspace_id, module).
  primary key (workspace_id, module)
);

comment on table public.workspace_modules is
  'Tools enabled in a workspace. Drives the workspace navigation. Overview and Members are implicit.';

-- ---------------------------------------------------------------------------
-- Defaults per workspace type (used for the backfill and by the app's picker).
-- ---------------------------------------------------------------------------
create function public.default_workspace_modules(workspace_type public.workspace_type)
returns public.workspace_module[]
language sql
immutable
set search_path = ''
as $$
  select case workspace_type
    when 'project' then array['issues', 'docs', 'diagrams', 'github', 'live']::public.workspace_module[]
    when 'course'  then array['learning', 'docs', 'diagrams', 'exercises', 'resources', 'live']::public.workspace_module[]
    else                array['docs', 'diagrams', 'resources', 'live']::public.workspace_module[]
  end;
$$;

comment on function public.default_workspace_modules(public.workspace_type) is
  'Default tools for a new workspace of this type. Defaults only; users can change them.';

revoke execute on function public.default_workspace_modules(public.workspace_type) from public, anon;
grant execute on function public.default_workspace_modules(public.workspace_type) to authenticated;

-- Backfill: existing workspaces get their type's defaults, so nothing loses tabs.
insert into public.workspace_modules (workspace_id, module)
select w.id, m.module
from public.workspaces w
cross join lateral unnest(public.default_workspace_modules(w.type)) as m(module)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS helper: can the caller see this workspace? (mirrors the workspaces
-- SELECT policy: team owner/admin, or a member of the workspace)
-- ---------------------------------------------------------------------------
create function private.can_view_workspace(w uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.workspace_role(w) is not null
      or private.is_team_admin((select ws.team_id from public.workspaces ws where ws.id = w));
$$;

revoke all on function private.can_view_workspace(uuid) from public, anon, authenticated;
grant execute on function private.can_view_workspace(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.workspace_modules from anon, authenticated;
grant select, delete on table public.workspace_modules to authenticated;
grant insert (workspace_id, module) on table public.workspace_modules to authenticated;

alter table public.workspace_modules enable row level security;

create policy "Workspace viewers can see enabled tools"
  on public.workspace_modules for select to authenticated
  using (private.can_view_workspace(workspace_id));

create policy "Admins and leads can enable tools"
  on public.workspace_modules for insert to authenticated
  with check (private.can_manage_workspace(workspace_id));

create policy "Admins and leads can disable tools"
  on public.workspace_modules for delete to authenticated
  using (private.can_manage_workspace(workspace_id));

-- ---------------------------------------------------------------------------
-- create_workspace: the workspace and its tools in one transaction.
-- security INVOKER: every insert is checked by the caller's RLS exactly as if
-- the app had made the two inserts itself — this only adds atomicity.
-- ---------------------------------------------------------------------------
create function public.create_workspace(
  p_team_id uuid,
  p_title text,
  p_description text,
  p_type public.workspace_type,
  p_modules public.workspace_module[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.workspaces (team_id, title, description, type)
  values (p_team_id, p_title, nullif(btrim(coalesce(p_description, '')), ''), p_type)
  returning id into new_id;

  insert into public.workspace_modules (workspace_id, module)
  select new_id, m
  from unnest(coalesce(p_modules, '{}')) as m
  on conflict do nothing;

  return new_id;
end;
$$;

comment on function public.create_workspace(uuid, text, text, public.workspace_type, public.workspace_module[]) is
  'Create a workspace with its enabled tools atomically. Runs with the caller''s permissions (RLS).';

-- ---------------------------------------------------------------------------
-- set_workspace_modules: replace a workspace's tool set in one transaction.
-- security INVOKER (RLS applies). The explicit check makes a no-op call by a
-- non-manager fail loudly instead of "succeeding" with zero rows changed.
-- ---------------------------------------------------------------------------
create function public.set_workspace_modules(
  p_workspace_id uuid,
  p_modules public.workspace_module[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.can_manage_workspace(p_workspace_id) then
    raise exception 'not allowed to change tools for this workspace' using errcode = '42501';
  end if;

  delete from public.workspace_modules
  where workspace_id = p_workspace_id
    and module <> all (coalesce(p_modules, '{}'));

  insert into public.workspace_modules (workspace_id, module)
  select p_workspace_id, m
  from unnest(coalesce(p_modules, '{}')) as m
  on conflict do nothing;
end;
$$;

comment on function public.set_workspace_modules(uuid, public.workspace_module[]) is
  'Replace the enabled tools of a workspace. Team owner/admin or workspace lead only.';

revoke execute on function public.create_workspace(uuid, text, text, public.workspace_type, public.workspace_module[])
  from public, anon;
grant execute on function public.create_workspace(uuid, text, text, public.workspace_type, public.workspace_module[])
  to authenticated;

revoke execute on function public.set_workspace_modules(uuid, public.workspace_module[]) from public, anon;
grant execute on function public.set_workspace_modules(uuid, public.workspace_module[]) to authenticated;
