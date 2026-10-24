-- Shared folders: diagrams live in the same folders as docs.
--
-- doc_folders already exist per scope (group-wide or one workspace, 3 levels deep). Diagrams get an
-- optional folder_id in their own scope, exactly like documents.folder_id, so one folder can hold the
-- architecture diagram next to the docs that explain it. Nothing else about folders changes.
--
-- Security is unchanged: diagrams are created, edited, moved and deleted by writers only
-- (private.can_write_document, the existing diagrams policies), so moving a diagram needs no extra
-- check beyond the UPDATE policy; the trigger below only keeps the folder in the diagram's scope.
--
-- Moving: move_folder_items() moves any mix of docs, diagrams and folders in one atomic step.
-- move_doc_items() keeps its arguments for tabs still running the previous app, and now hands over
-- to it. Deleting a folder: the app deletes the docs and diagrams inside first; as with docs, a
-- diagram whose folder disappears anyway drops back to the top level (set null).

alter table public.diagrams
  add column folder_id uuid references public.doc_folders (id) on delete set null;

create index diagrams_folder_idx on public.diagrams (folder_id);

comment on table public.doc_folders is
  'Folders for docs and diagrams, team-wide or per workspace, nested at most 3 levels.';

-- A diagram's folder must be in the diagram's own scope.
create function private.check_diagram_folder()
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
  return new;
end;
$$;

revoke all on function private.check_diagram_folder() from public, anon, authenticated;

create trigger check_diagram_folder
  before insert or update of folder_id on public.diagrams
  for each row execute function private.check_diagram_folder();

grant insert (folder_id), update (folder_id) on table public.diagrams to authenticated;

-- ---------------------------------------------------------------------------
-- Moving docs, diagrams and folders together
-- ---------------------------------------------------------------------------
-- The rules of move_doc_items (20261008110000), plus diagrams: you must be a writer in the scope; a
-- doc, diagram or folder only moves within its own scope; folders stay at most 3 levels deep counting
-- everything inside the moved folder; a folder can't move into itself; sibling folder names are unique.

create function public.move_folder_items(p_doc_ids uuid[], p_diagram_ids uuid[], p_folder_ids uuid[], p_target uuid)
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
    if not found or not private.can_write_document(v_target.team_id, v_target.workspace_id) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;

  -- Docs and diagrams: every one must exist and be in a scope the caller writes in; the triggers
  -- then check that the target is in each one's own scope.
  if exists (
    select 1 from public.documents d
    where d.id = any(p_doc_ids) and not private.can_write_document(d.team_id, d.workspace_id)
  ) or (select count(*) from public.documents d where d.id = any(p_doc_ids)) <> (select count(distinct x) from unnest(p_doc_ids) x) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.diagrams d
    where d.id = any(p_diagram_ids) and not private.can_write_document(d.team_id, d.workspace_id)
  ) or (select count(*) from public.diagrams d where d.id = any(p_diagram_ids)) <> (select count(distinct x) from unnest(p_diagram_ids) x) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  foreach v_folder_id in array p_folder_ids loop
    select * into v_folder from public.doc_folders f where f.id = v_folder_id for update;
    if not found or not private.can_write_document(v_folder.team_id, v_folder.workspace_id) then
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

revoke all on function public.move_folder_items(uuid[], uuid[], uuid[], uuid) from public, anon;
grant execute on function public.move_folder_items(uuid[], uuid[], uuid[], uuid) to authenticated;

-- The previous app calls this; same arguments, same behaviour, one implementation.
create or replace function public.move_doc_items(p_doc_ids uuid[], p_folder_ids uuid[], p_target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.move_folder_items(p_doc_ids, '{}'::uuid[], p_folder_ids, p_target);
$$;

revoke all on function public.move_doc_items(uuid[], uuid[], uuid) from public, anon;
grant execute on function public.move_doc_items(uuid[], uuid[], uuid) to authenticated;
