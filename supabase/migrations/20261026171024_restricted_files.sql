-- Restricted docs, whiteboards and folders (owner's request, 2026-10-26).
--
-- Each doc, whiteboard (diagram) and folder has an `access`:
--   * 'place' (default, as before): everyone who can open its place (the group, or the workspace);
--   * 'restricted': only the person who made it, the people it is shared with (viewer or editor),
--     and group owners/admins, who always see everything. Nobody else sees that it exists.
-- A restricted folder restricts everything inside it (its subfolders, docs and whiteboards), except
-- what is shared with someone directly.
--
-- One function, private.file_level(), answers "how much can the caller do with this item", and every
-- rule below (reads, writes, images, moves, the folder triggers) goes through it:
--   0 = can't see it, 1 = can view, 2 = can edit because it was shared with them as an editor,
--   3 = nothing restricts them: the usual role rules decide (members edit docs, writers the rest).

create type public.file_access as enum ('place', 'restricted');

alter table public.documents add column access public.file_access not null default 'place';
alter table public.diagrams add column access public.file_access not null default 'place';
alter table public.doc_folders add column access public.file_access not null default 'place';

-- ------------------------------------------------------------------ who it is shared with

create table public.file_shares (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  document_id uuid references public.documents (id) on delete cascade,
  diagram_id  uuid references public.diagrams (id) on delete cascade,
  folder_id   uuid references public.doc_folders (id) on delete cascade,
  user_id     uuid not null,
  role        text not null default 'viewer',
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint file_shares_one_item check (num_nonnulls(document_id, diagram_id, folder_id) = 1),
  constraint file_shares_role check (role in ('viewer', 'editor')),
  -- Leaving the group ends every share in it.
  constraint file_shares_member_fkey foreign key (team_id, user_id)
    references public.team_members (team_id, user_id) on delete cascade
);

comment on table public.file_shares is 'Who a restricted doc, whiteboard or folder is shared with (viewer or editor). team_id is set by a trigger.';

create unique index file_shares_document_user_key on public.file_shares (document_id, user_id) where document_id is not null;
create unique index file_shares_diagram_user_key on public.file_shares (diagram_id, user_id) where diagram_id is not null;
create unique index file_shares_folder_user_key on public.file_shares (folder_id, user_id) where folder_id is not null;
create index file_shares_user_idx on public.file_shares (user_id);

-- ------------------------------------------------------------------ the level

create function private.file_level(
  t uuid, w uuid, p_folder uuid, p_access public.file_access, p_owner uuid, p_kind text, p_item uuid
)
returns smallint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  v_role text;
  v_cap smallint := 3;
  r record;
begin
  if not private.can_read_document(t, w) then return 0; end if;
  if private.is_team_admin(t) then return 3; end if;

  -- Shared with the caller directly: that role, whatever is restricted around it.
  select s.role into v_role
    from public.file_shares s
   where s.user_id = me
     and case p_kind when 'doc' then s.document_id when 'diagram' then s.diagram_id else s.folder_id end = p_item;
  if v_role is not null then return case v_role when 'editor' then 2 else 1 end; end if;

  if p_access = 'restricted' and p_owner is distinct from me then return 0; end if;

  -- Every restricted folder above it (at most 3 levels): its maker, or someone it is shared with.
  for r in
    with recursive chain as (
      select f.id, f.parent_id, f.access, f.created_by from public.doc_folders f where f.id = p_folder
      union all
      select f.id, f.parent_id, f.access, f.created_by from public.doc_folders f join chain c on f.id = c.parent_id
    )
    select c.id, c.created_by from chain c where c.access = 'restricted'
  loop
    if r.created_by is not distinct from me then continue; end if;
    v_role := null;
    select s.role into v_role from public.file_shares s where s.folder_id = r.id and s.user_id = me;
    if v_role is null then return 0; end if;
    v_cap := least(v_cap, case v_role when 'editor' then 2 else 1 end);
  end loop;
  return v_cap;
end;
$$;

-- A folder's level (for "may I create or move things inside it").
create function private.folder_level(f uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.file_level(d.team_id, d.workspace_id, d.parent_id, d.access, d.created_by, 'folder', d.id)
       from public.doc_folders d where d.id = f),
    0
  )::smallint;
$$;

revoke execute on function private.file_level(uuid, uuid, uuid, public.file_access, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function private.folder_level(uuid) from public, anon, authenticated;
grant execute on function private.file_level(uuid, uuid, uuid, public.file_access, uuid, text, uuid) to authenticated;
grant execute on function private.folder_level(uuid) to authenticated;

-- ------------------------------------------------------------------ row rules

drop policy "Readers can see documents" on public.documents;
drop policy "Editors can create documents" on public.documents;
drop policy "Editors can edit documents" on public.documents;
drop policy "Writers can delete documents" on public.documents;

create policy "Readers can see documents" on public.documents for select to authenticated
  using (private.file_level(team_id, workspace_id, folder_id, access, created_by, 'doc', id) >= 1);
create policy "Editors can create documents" on public.documents for insert to authenticated
  with check (private.can_edit_document(team_id, workspace_id) and (folder_id is null or private.folder_level(folder_id) >= 2));
create policy "Editors can edit documents" on public.documents for update to authenticated
  using (
    (private.file_level(team_id, workspace_id, folder_id, access, created_by, 'doc', id) = 3 and private.can_edit_document(team_id, workspace_id))
    or private.file_level(team_id, workspace_id, folder_id, access, created_by, 'doc', id) = 2
  )
  with check (private.can_read_document(team_id, workspace_id));
create policy "Writers can delete documents" on public.documents for delete to authenticated
  using (private.file_level(team_id, workspace_id, folder_id, access, created_by, 'doc', id) = 3 and private.can_write_document(team_id, workspace_id));

drop policy "Readers can see diagrams" on public.diagrams;
drop policy "Writers can create diagrams" on public.diagrams;
drop policy "Writers can edit diagrams" on public.diagrams;
drop policy "Writers can delete diagrams" on public.diagrams;

create policy "Readers can see diagrams" on public.diagrams for select to authenticated
  using (private.file_level(team_id, workspace_id, folder_id, access, created_by, 'diagram', id) >= 1);
create policy "Writers can create diagrams" on public.diagrams for insert to authenticated
  with check (private.can_write_document(team_id, workspace_id) and (folder_id is null or private.folder_level(folder_id) >= 2));
create policy "Writers can edit diagrams" on public.diagrams for update to authenticated
  using (
    (private.file_level(team_id, workspace_id, folder_id, access, created_by, 'diagram', id) = 3 and private.can_write_document(team_id, workspace_id))
    or private.file_level(team_id, workspace_id, folder_id, access, created_by, 'diagram', id) = 2
  )
  with check (private.can_read_document(team_id, workspace_id));
create policy "Writers can delete diagrams" on public.diagrams for delete to authenticated
  using (private.file_level(team_id, workspace_id, folder_id, access, created_by, 'diagram', id) = 3 and private.can_write_document(team_id, workspace_id));

drop policy "Doc readers can see folders" on public.doc_folders;
drop policy "Doc writers can create folders" on public.doc_folders;
drop policy "Doc writers can rename folders" on public.doc_folders;
drop policy "Doc writers can delete folders" on public.doc_folders;

create policy "Doc readers can see folders" on public.doc_folders for select to authenticated
  using (private.file_level(team_id, workspace_id, parent_id, access, created_by, 'folder', id) >= 1);
create policy "Doc writers can create folders" on public.doc_folders for insert to authenticated
  with check (private.can_write_document(team_id, workspace_id) and (parent_id is null or private.folder_level(parent_id) >= 2));
create policy "Doc writers can rename folders" on public.doc_folders for update to authenticated
  using (private.file_level(team_id, workspace_id, parent_id, access, created_by, 'folder', id) = 3 and private.can_write_document(team_id, workspace_id))
  with check (private.can_write_document(team_id, workspace_id));
create policy "Doc writers can delete folders" on public.doc_folders for delete to authenticated
  using (private.file_level(team_id, workspace_id, parent_id, access, created_by, 'folder', id) = 3 and private.can_write_document(team_id, workspace_id));

grant insert (access), update (access) on table public.documents to authenticated;
grant insert (access), update (access) on table public.diagrams to authenticated;
grant insert (access), update (access) on table public.doc_folders to authenticated;

-- Only the person who made it, or a group owner/admin, changes who may open it.
create function private.check_file_access_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.access is distinct from old.access
     and (select auth.uid()) is not null
     and old.created_by is distinct from (select auth.uid())
     and not private.is_team_admin(old.team_id) then
    raise exception 'Only its owner or a group admin can change who may open it' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.check_file_access_change() from public, anon, authenticated;
create trigger check_file_access_change before update of access on public.documents for each row execute function private.check_file_access_change();
create trigger check_file_access_change before update of access on public.diagrams for each row execute function private.check_file_access_change();
create trigger check_file_access_change before update of access on public.doc_folders for each row execute function private.check_file_access_change();

-- Moving into a folder needs that folder open to the caller (it can't be a way into a restricted one).
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
  -- (Only for people: a server job or the table owner has no auth.uid() and isn't restricted.)
  if new.folder_id is not null
    and (select auth.uid()) is not null
    and (tg_op = 'INSERT' or new.folder_id is distinct from old.folder_id)
    and private.folder_level(new.folder_id) < 2 then
    raise exception 'You can’t put things in that folder' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.check_diagram_folder()
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
    raise exception 'The folder must be in the same place as the diagram' using errcode = '23514';
  end if;
  -- (Only for people: a server job or the table owner has no auth.uid() and isn't restricted.)
  if new.folder_id is not null
    and (select auth.uid()) is not null
    and (tg_op = 'INSERT' or new.folder_id is distinct from old.folder_id)
    and private.folder_level(new.folder_id) < 2 then
    raise exception 'You can’t put things in that folder' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Deleting a folder deletes its subfolders, and their docs would drop to the top level, open to the
-- whole place. So nobody deletes a folder holding a subfolder they can't open.
create function private.check_folder_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and exists (
    with recursive below as (
      select f.id, f.team_id, f.workspace_id, f.parent_id, f.access, f.created_by from public.doc_folders f where f.parent_id = old.id
      union all
      select c.id, c.team_id, c.workspace_id, c.parent_id, c.access, c.created_by from public.doc_folders c join below b on c.parent_id = b.id
    )
    select 1 from below b
     where private.file_level(b.team_id, b.workspace_id, b.parent_id, b.access, b.created_by, 'folder', b.id) < 3
  ) then
    raise exception 'This folder holds a restricted folder you can’t open' using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke execute on function private.check_folder_delete() from public, anon, authenticated;
create trigger check_folder_delete before delete on public.doc_folders for each row execute function private.check_folder_delete();

-- ------------------------------------------------------------------ images in docs follow the doc

create or replace function private.can_access_doc_image(object_name text, for_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = private.to_uuid((storage.foldername(object_name))[2])
      and case
        when for_write then private.file_level(d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by, 'doc', d.id) = 3
          and private.can_write_document(d.team_id, d.workspace_id)
        else private.file_level(d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by, 'doc', d.id) >= 1
      end
  );
$$;

create or replace function private.can_upload_doc_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = private.to_uuid((storage.foldername(object_name))[2])
      and (
        (private.file_level(d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by, 'doc', d.id) = 3
          and private.can_edit_document(d.team_id, d.workspace_id))
        or private.file_level(d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by, 'doc', d.id) = 2
      )
  );
$$;

-- ------------------------------------------------------------------ moving (bypasses RLS: check here)

create or replace function public.move_folder_items(p_doc_ids uuid[], p_diagram_ids uuid[], p_folder_ids uuid[], p_target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.doc_folders;
  v_folder public.doc_folders;
  v_folder_id uuid;
  v_new_depth smallint;
  v_height integer;
  v_shift integer;
begin
  p_doc_ids := coalesce(p_doc_ids, '{}');
  p_diagram_ids := coalesce(p_diagram_ids, '{}');
  p_folder_ids := coalesce(p_folder_ids, '{}');
  if cardinality(p_doc_ids) > 200 or cardinality(p_diagram_ids) > 200 or cardinality(p_folder_ids) > 200 then
    raise exception 'Too many items' using errcode = '22023';
  end if;

  if p_target is not null then
    select * into v_target from public.doc_folders f where f.id = p_target;
    if not found or not private.can_write_document(v_target.team_id, v_target.workspace_id) or private.folder_level(p_target) < 2 then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;

  -- Docs and diagrams: every one must exist, be in a scope the caller writes in, and be open to them
  -- (a restricted item someone can't see can't be moved by them); the triggers check the target's scope.
  if exists (
    select 1 from public.documents d
    where d.id = any(p_doc_ids)
      and (not private.can_write_document(d.team_id, d.workspace_id)
        or private.file_level(d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by, 'doc', d.id) < 3)
  ) or (select count(*) from public.documents d where d.id = any(p_doc_ids)) <> (select count(distinct x) from unnest(p_doc_ids) x) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.diagrams d
    where d.id = any(p_diagram_ids)
      and (not private.can_write_document(d.team_id, d.workspace_id)
        or private.file_level(d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by, 'diagram', d.id) < 3)
  ) or (select count(*) from public.diagrams d where d.id = any(p_diagram_ids)) <> (select count(distinct x) from unnest(p_diagram_ids) x) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  foreach v_folder_id in array p_folder_ids loop
    select * into v_folder from public.doc_folders f where f.id = v_folder_id for update;
    if not found
      or not private.can_write_document(v_folder.team_id, v_folder.workspace_id)
      or private.file_level(v_folder.team_id, v_folder.workspace_id, v_folder.parent_id, v_folder.access, v_folder.created_by, 'folder', v_folder.id) < 3 then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if p_target is not distinct from v_folder.parent_id then continue; end if;

    if p_target is null then
      v_new_depth := 1;
    else
      if v_target.team_id <> v_folder.team_id or v_target.workspace_id is distinct from v_folder.workspace_id then
        raise exception 'A folder can only move within the same place' using errcode = '23514';
      end if;
      if exists (
        with recursive below as (
          select f.id from public.doc_folders f where f.id = v_folder.id
          union all
          select c.id from public.doc_folders c join below b on c.parent_id = b.id
        ) select 1 from below where id = p_target
      ) then
        raise exception 'A folder can’t be moved into itself' using errcode = '23514';
      end if;
      v_new_depth := v_target.depth + 1;
    end if;

    -- How many levels the moved folder brings with it.
    with recursive below as (
      select f.id, f.depth from public.doc_folders f where f.id = v_folder.id
      union all
      select c.id, c.depth from public.doc_folders c join below b on c.parent_id = b.id
    ) select max(depth) - v_folder.depth into v_height from below;
    if v_new_depth + v_height > 3 then
      raise exception 'Folders can only be nested 3 levels deep' using errcode = '23514';
    end if;

    v_shift := v_new_depth - v_folder.depth;
    update public.doc_folders set parent_id = p_target, depth = v_new_depth where id = v_folder.id;
    if v_shift <> 0 then
      update public.doc_folders set depth = depth + v_shift
       where id in (
         with recursive below as (
           select c.id from public.doc_folders c where c.parent_id = v_folder.id
           union all
           select c.id from public.doc_folders c join below b on c.parent_id = b.id
         ) select id from below
       );
    end if;
  end loop;

  update public.documents set folder_id = p_target
   where id = any(p_doc_ids) and folder_id is distinct from p_target;
  update public.diagrams set folder_id = p_target
   where id = any(p_diagram_ids) and folder_id is distinct from p_target;
end;
$$;

-- ------------------------------------------------------------------ sharing rules

-- The item a share points at, and whether the caller may see (p_manage false) or change its sharing.
create function private.file_share_rights(p_document uuid, p_diagram uuid, p_folder uuid, p_manage boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team uuid; v_workspace uuid; v_parent uuid; v_access public.file_access; v_owner uuid; v_kind text; v_item uuid;
  v_level smallint;
begin
  if p_document is not null then
    select d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by into v_team, v_workspace, v_parent, v_access, v_owner from public.documents d where d.id = p_document;
    v_kind := 'doc'; v_item := p_document;
  elsif p_diagram is not null then
    select d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by into v_team, v_workspace, v_parent, v_access, v_owner from public.diagrams d where d.id = p_diagram;
    v_kind := 'diagram'; v_item := p_diagram;
  else
    select f.team_id, f.workspace_id, f.parent_id, f.access, f.created_by into v_team, v_workspace, v_parent, v_access, v_owner from public.doc_folders f where f.id = p_folder;
    v_kind := 'folder'; v_item := p_folder;
  end if;
  if v_team is null then return false; end if;
  v_level := private.file_level(v_team, v_workspace, v_parent, v_access, v_owner, v_kind, v_item);
  if not p_manage then return v_level >= 1; end if;
  return v_level >= 1 and (v_owner = (select auth.uid()) or private.is_team_admin(v_team));
end;
$$;
revoke execute on function private.file_share_rights(uuid, uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function private.file_share_rights(uuid, uuid, uuid, boolean) to authenticated;

-- team_id comes from the item; the person must be able to open the item's place.
create function private.prepare_file_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid; v_workspace uuid;
begin
  if new.document_id is not null then
    select d.team_id, d.workspace_id into v_team, v_workspace from public.documents d where d.id = new.document_id;
  elsif new.diagram_id is not null then
    select d.team_id, d.workspace_id into v_team, v_workspace from public.diagrams d where d.id = new.diagram_id;
  else
    select f.team_id, f.workspace_id into v_team, v_workspace from public.doc_folders f where f.id = new.folder_id;
  end if;
  if v_team is null then raise exception 'Nothing to share' using errcode = '23503'; end if;
  new.team_id := v_team;
  if v_workspace is not null and not private.has_workspace_access(v_workspace, new.user_id) then
    raise exception 'They can’t open this workspace' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.prepare_file_share() from public, anon, authenticated;
create trigger prepare_file_share before insert on public.file_shares for each row execute function private.prepare_file_share();

alter table public.file_shares enable row level security;
revoke all on table public.file_shares from anon, authenticated;
grant select, delete on table public.file_shares to authenticated;
grant insert (document_id, diagram_id, folder_id, user_id, role), update (role) on table public.file_shares to authenticated;

create policy "People who can open it see who it is shared with" on public.file_shares for select to authenticated
  using (user_id = (select auth.uid()) or private.file_share_rights(document_id, diagram_id, folder_id, false));
create policy "Its owner or an admin shares it" on public.file_shares for insert to authenticated
  with check (private.file_share_rights(document_id, diagram_id, folder_id, true));
create policy "Its owner or an admin changes a share" on public.file_shares for update to authenticated
  using (private.file_share_rights(document_id, diagram_id, folder_id, true))
  with check (private.file_share_rights(document_id, diagram_id, folder_id, true));
create policy "Its owner or an admin removes a share" on public.file_shares for delete to authenticated
  using (private.file_share_rights(document_id, diagram_id, folder_id, true));

-- Live updates: being shared something (or unshared) refreshes Files.
alter publication supabase_realtime add table public.file_shares;
