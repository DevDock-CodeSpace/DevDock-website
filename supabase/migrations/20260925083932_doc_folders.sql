-- Folders for Docs (Dropbox-style), at most 3 levels deep.
--
-- A folder lives in the same scope as documents: team-wide (workspace_id null)
-- or in one workspace. Its parent must be in that same scope. Documents get
-- an optional folder_id in their own scope.
--
-- Security: exactly the documents rules (private.can_read_document /
-- can_write_document): whoever can read docs in a scope sees its folders;
-- whoever can write docs there creates, renames and deletes folders.
--
-- Deleting a folder deletes its subfolders (cascade). The app deletes the
-- docs inside first (so their Storage images go too); as a safety net, a doc
-- whose folder disappears anyway drops back to the top level (set null).

create table public.doc_folders (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid,
  parent_id    uuid references public.doc_folders (id) on delete cascade,
  name         text not null,
  -- 1 = top level; set by trigger, max 3.
  depth        smallint not null,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint doc_folders_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint doc_folders_depth check (depth between 1 and 3),
  constraint doc_folders_workspace_team_fkey foreign key (workspace_id, team_id)
    references public.workspaces (id, team_id) on delete cascade
);

comment on table public.doc_folders is 'Folders for docs, team-wide or per workspace, nested at most 3 levels.';

-- No two folders with the same name side by side (case-insensitive).
create unique index doc_folders_sibling_name_idx on public.doc_folders (
  team_id,
  coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);
create index doc_folders_parent_idx on public.doc_folders (parent_id);
create index doc_folders_workspace_idx on public.doc_folders (workspace_id) where workspace_id is not null;
create index doc_folders_created_by_idx on public.doc_folders (created_by);

create trigger set_updated_at
  before update on public.doc_folders
  for each row execute function public.set_updated_at();

-- On insert: the parent must be in the same scope; depth = parent's + 1 (max 3).
-- (parent_id, team_id and workspace_id aren't updatable, so this only runs on insert.)
create function private.prepare_doc_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.doc_folders;
begin
  if new.parent_id is null then
    new.depth := 1;
    return new;
  end if;
  select * into parent from public.doc_folders f where f.id = new.parent_id;
  if not found or parent.team_id <> new.team_id or parent.workspace_id is distinct from new.workspace_id then
    raise exception 'The parent folder must be in the same place' using errcode = '23514';
  end if;
  new.depth := parent.depth + 1;
  if new.depth > 3 then
    raise exception 'Folders can only be nested 3 levels deep' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger prepare_doc_folder
  before insert on public.doc_folders
  for each row execute function private.prepare_doc_folder();

-- ---------------------------------------------------------------------------
-- documents.folder_id
-- ---------------------------------------------------------------------------
alter table public.documents
  add column folder_id uuid references public.doc_folders (id) on delete set null;

create index documents_folder_idx on public.documents (folder_id);

-- A doc's folder must be in the doc's own scope.
create function private.check_document_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.folder_id is not null and not exists (
    select 1 from public.doc_folders f
    where f.id = new.folder_id
      and f.team_id = new.team_id
      and f.workspace_id is not distinct from new.workspace_id
  ) then
    raise exception 'The folder must be in the same place as the doc' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_document_folder
  before insert or update of folder_id on public.documents
  for each row execute function private.check_document_folder();

grant insert (folder_id), update (folder_id) on table public.documents to authenticated;

revoke all on function private.prepare_doc_folder(), private.check_document_folder()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS (the documents rules)
-- ---------------------------------------------------------------------------
revoke all on table public.doc_folders from anon, authenticated;
grant select, delete on table public.doc_folders to authenticated;
grant insert (team_id, workspace_id, parent_id, name), update (name) on table public.doc_folders to authenticated;

alter table public.doc_folders enable row level security;

create policy "Doc readers can see folders"
  on public.doc_folders for select to authenticated
  using (private.can_read_document(team_id, workspace_id));

create policy "Doc writers can create folders"
  on public.doc_folders for insert to authenticated
  with check (private.can_write_document(team_id, workspace_id));

create policy "Doc writers can rename folders"
  on public.doc_folders for update to authenticated
  using (private.can_write_document(team_id, workspace_id))
  with check (private.can_write_document(team_id, workspace_id));

create policy "Doc writers can delete folders"
  on public.doc_folders for delete to authenticated
  using (private.can_write_document(team_id, workspace_id));
