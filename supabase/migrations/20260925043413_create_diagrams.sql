-- Diagrams: architecture/flow diagrams drawn in the in-app editor (React Flow).
--
-- Scope works exactly like documents:
--   * workspace_id is null → team-wide diagram
--   * workspace_id = X     → assigned to workspace X (same team; composite FK)
--
-- `data` is the editor's JSON: { "nodes": [...], "edges": [...] }. The app
-- validates it when loading; the database only caps its size.
--
-- Security: the same rules as documents, so the same helpers are reused
-- (private.can_read_document / private.can_write_document take a team and an
-- optional workspace, nothing document-specific):
--   * read   team-wide: any team member
--            workspace diagram: members of that workspace, and team owners/admins
--   * write  team-wide: team owners/admins
--            workspace diagram: that workspace's lead, and team owners/admins
--   * created_by is always the caller (default auth.uid(), no insert grant on it)
--   * team_id / workspace_id can't be changed after creation (no update grant)
--   * deleting a workspace deletes its diagrams (cascade)

create table public.diagrams (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid,
  title        text not null,
  data         jsonb not null default '{"nodes": [], "edges": []}'::jsonb,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint diagrams_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint diagrams_data_object check (jsonb_typeof(data) = 'object'),
  constraint diagrams_data_size check (octet_length(data::text) <= 2000000),
  -- MATCH SIMPLE: a null workspace_id (team-wide) skips the check.
  constraint diagrams_workspace_team_fkey foreign key (workspace_id, team_id)
    references public.workspaces (id, team_id) on delete cascade
);

comment on table public.diagrams is
  'Diagrams. workspace_id null = team-wide; otherwise assigned to that workspace (same team).';
comment on column public.diagrams.data is
  'Editor JSON: { nodes, edges } (React Flow). Validated by the app on load.';

create index diagrams_team_updated_idx on public.diagrams (team_id, updated_at desc);
create index diagrams_workspace_updated_idx on public.diagrams (workspace_id, updated_at desc)
  where workspace_id is not null;
create index diagrams_created_by_idx on public.diagrams (created_by);

create trigger set_updated_at
  before update on public.diagrams
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.diagrams from anon, authenticated;
grant select, delete on table public.diagrams to authenticated;
grant insert (team_id, workspace_id, title, data) on table public.diagrams to authenticated;
grant update (title, data) on table public.diagrams to authenticated;

alter table public.diagrams enable row level security;

create policy "Readers can see diagrams"
  on public.diagrams for select to authenticated
  using (private.can_read_document(team_id, workspace_id));

create policy "Writers can create diagrams"
  on public.diagrams for insert to authenticated
  with check (private.can_write_document(team_id, workspace_id));

create policy "Writers can edit diagrams"
  on public.diagrams for update to authenticated
  using (private.can_write_document(team_id, workspace_id))
  with check (private.can_write_document(team_id, workspace_id));

create policy "Writers can delete diagrams"
  on public.diagrams for delete to authenticated
  using (private.can_write_document(team_id, workspace_id));
