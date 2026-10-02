-- Members can create and edit docs (product decision, every group type).
--
-- Before: only writers (group owners/admins for group-wide docs, the
-- workspace lead for workspace docs) could create or edit a doc, so a doc a
-- lead created was view-only for everyone else.
--
-- Now, in a scope (group-wide or one workspace):
--   * create, edit title/body, upload images: everyone who can read docs there
--     (group-wide: any group member; workspace: its members, plus group
--     owners/admins), so also inside folders
--   * delete docs, move docs between folders, manage folders: writers only,
--     as before (private.can_write_document, unchanged; diagrams and live
--     sessions keep using it)

create function private.can_edit_document(t uuid, w uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Editors are exactly the readers of that scope.
  select private.can_read_document(t, w);
$$;

revoke all on function private.can_edit_document(uuid, uuid) from public, anon, authenticated;
grant execute on function private.can_edit_document(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- documents: create + edit for editors (delete stays with writers)
-- ---------------------------------------------------------------------------
drop policy "Writers can create documents" on public.documents;
drop policy "Writers can edit documents" on public.documents;

create policy "Editors can create documents"
  on public.documents for insert to authenticated
  with check (private.can_edit_document(team_id, workspace_id));

create policy "Editors can edit documents"
  on public.documents for update to authenticated
  using (private.can_edit_document(team_id, workspace_id))
  with check (private.can_edit_document(team_id, workspace_id));

-- ---------------------------------------------------------------------------
-- Moving a doc to another folder stays with writers. Editors pass the UPDATE
-- policy and hold the folder_id column grant, so check it here. Creating a doc
-- inside a folder (insert) is fine for editors.
-- ---------------------------------------------------------------------------
create or replace function private.check_document_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.folder_id is distinct from old.folder_id
    and not private.can_write_document(new.team_id, new.workspace_id) then
    raise exception 'Only writers can move docs between folders' using errcode = '42501';
  end if;
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

revoke all on function private.check_document_folder() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- doc-images: editors upload; deleting images stays with writers (only done
-- when a doc is deleted).
-- ---------------------------------------------------------------------------
create function private.can_upload_doc_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.team_id = private.to_uuid((storage.foldername(object_name))[1])
      and d.id = private.to_uuid((storage.foldername(object_name))[2])
      and private.can_edit_document(d.team_id, d.workspace_id)
  );
$$;

revoke all on function private.can_upload_doc_image(text) from public, anon, authenticated;
grant execute on function private.can_upload_doc_image(text) to authenticated;

drop policy "Doc editors can upload doc images" on storage.objects;

create policy "Doc editors can upload doc images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'doc-images' and private.can_upload_doc_image(name));
