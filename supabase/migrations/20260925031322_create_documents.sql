-- Documents (Docs): plain-text content for now; a rich editor comes later.
--
-- Scope:
--   * workspace_id is null → team-wide document
--   * workspace_id = X     → assigned to workspace X (which must be in the same team;
--                            enforced by a composite FK on (workspace_id, team_id))
-- Team → Docs lists every document the caller can read; a workspace's Docs tab
-- lists only rows with that workspace_id.
--
-- Security:
--   * read   team-wide: any team member
--            workspace doc: members of that workspace, and team owners/admins
--   * write  team-wide: team owners/admins
--            workspace doc: that workspace's lead, and team owners/admins
--   * outsiders (not in the team) see and change nothing
--   * created_by is always the caller (default auth.uid(), no insert grant on it)
--   * team_id / workspace_id can't be changed after creation (no update grant),
--     so a document can't be moved into a scope the caller couldn't create in
--   * deleting a workspace deletes its documents (cascade) instead of silently
--     promoting them to team-wide, where more people could read them

create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid,
  title        text not null,
  content      text not null default '',
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint documents_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint documents_content_length check (char_length(content) <= 200000),
  -- MATCH SIMPLE: a null workspace_id (team-wide) skips the check.
  constraint documents_workspace_team_fkey foreign key (workspace_id, team_id)
    references public.workspaces (id, team_id) on delete cascade
);

comment on table public.documents is
  'Docs. workspace_id null = team-wide; otherwise assigned to that workspace (same team).';

create index documents_team_updated_idx on public.documents (team_id, updated_at desc);
create index documents_workspace_updated_idx on public.documents (workspace_id, updated_at desc)
  where workspace_id is not null;
create index documents_created_by_idx on public.documents (created_by);

create trigger set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers (security definer so policies don't recurse through other RLS)
-- ---------------------------------------------------------------------------
create function private.can_read_document(t uuid, w uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when w is null then private.is_team_member(t)
    else private.can_view_workspace(w)
  end;
$$;

create function private.can_write_document(t uuid, w uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when w is null then private.is_team_admin(t)
    else private.can_manage_workspace(w)
  end;
$$;

revoke all on function private.can_read_document(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_write_document(uuid, uuid) from public, anon, authenticated;
grant execute on function private.can_read_document(uuid, uuid) to authenticated;
grant execute on function private.can_write_document(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.documents from anon, authenticated;
grant select, delete on table public.documents to authenticated;
grant insert (team_id, workspace_id, title, content) on table public.documents to authenticated;
grant update (title, content) on table public.documents to authenticated;

alter table public.documents enable row level security;

create policy "Readers can see documents"
  on public.documents for select to authenticated
  using (private.can_read_document(team_id, workspace_id));

create policy "Writers can create documents"
  on public.documents for insert to authenticated
  with check (private.can_write_document(team_id, workspace_id));

create policy "Writers can edit documents"
  on public.documents for update to authenticated
  using (private.can_write_document(team_id, workspace_id))
  with check (private.can_write_document(team_id, workspace_id));

create policy "Writers can delete documents"
  on public.documents for delete to authenticated
  using (private.can_write_document(team_id, workspace_id));
