-- Moving docs and folders (drag and drop in Docs). Docs could already change folder, but a folder's
-- parent could never change. This moves any mix of docs and folders into a folder (or the top level) in
-- one atomic step, so a multi-select either moves entirely or not at all.
--
-- Same rules as creating things there: you must be a doc writer in the scope (group owners/admins,
-- workspace leads); a doc or folder only moves within its own scope (group-wide or one workspace);
-- folders stay at most 3 levels deep counting everything inside the moved folder; a folder can't
-- move into itself or its own subfolders; and no two sibling folders share a name.

create function public.move_doc_items(p_doc_ids uuid[], p_folder_ids uuid[], p_target uuid)
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
  p_folder_ids := coalesce(p_folder_ids, '{}');
  if cardinality(p_doc_ids) > 200 or cardinality(p_folder_ids) > 200 then
    raise exception 'Too many items' using errcode = '22023';
  end if;

  if p_target is not null then
    select * into v_target from public.doc_folders f where f.id = p_target;
    if not found or not private.can_write_document(v_target.team_id, v_target.workspace_id) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;

  -- Docs: every one must be in a scope the caller writes in, and (below) in the target's scope.
  if exists (
    select 1 from public.documents d
    where d.id = any(p_doc_ids) and not private.can_write_document(d.team_id, d.workspace_id)
  ) or (select count(*) from public.documents d where d.id = any(p_doc_ids)) <> (select count(distinct x) from unnest(p_doc_ids) x) then
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

  -- The documents trigger checks that the target is in each doc's own scope.
  update public.documents set folder_id = p_target
   where id = any(p_doc_ids) and folder_id is distinct from p_target;
end;
$$;

revoke all on function public.move_doc_items(uuid[], uuid[], uuid) from public, anon;
grant execute on function public.move_doc_items(uuid[], uuid[], uuid) to authenticated;
