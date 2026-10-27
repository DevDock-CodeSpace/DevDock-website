-- Plan files, fix: the "a plan is changing its own folder" flag (devdock.plan_files) stayed on for the
-- rest of the transaction after a plan was created, renamed or deleted, so a hand rename of a plan's
-- folder later in the same transaction got through. Each function now turns it off when it's done.

create or replace function private.ensure_plan_files(p_plan uuid, p_whiteboard boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_root uuid;
  v_folder uuid;
  v_name text;
  v_doc uuid;
  v_board uuid;
begin
  select * into v_plan from public.plans where id = p_plan;
  if v_plan.id is null then return; end if;
  perform set_config('devdock.plan_files', 'on', true);

  select f.id into v_root from public.doc_folders f where f.team_id = v_plan.team_id and f.is_plans_root;
  if v_root is null then
    -- A top-level group folder already called "Plans" becomes the Plans folder.
    select f.id into v_root from public.doc_folders f
     where f.team_id = v_plan.team_id and f.workspace_id is null and f.parent_id is null and lower(btrim(f.name)) = 'plans';
    if v_root is not null then
      update public.doc_folders set is_plans_root = true where id = v_root;
    else
      insert into public.doc_folders (team_id, workspace_id, parent_id, name, is_plans_root)
      values (v_plan.team_id, null, null, 'Plans', true)
      returning id into v_root;
    end if;
  end if;

  v_folder := v_plan.folder_id;
  if v_folder is null then
    select f.id into v_folder from public.doc_folders f where f.plan_id = p_plan;
  end if;
  if v_folder is null then
    v_name := left(v_plan.name, 100);
    -- A folder of that name already beside it (made by hand): this one says it's the plan's.
    if exists (select 1 from public.doc_folders f where f.parent_id = v_root and lower(btrim(f.name)) = lower(btrim(v_name))) then
      v_name := left(v_plan.name, 93) || ' (plan)';
    end if;
    insert into public.doc_folders (team_id, workspace_id, parent_id, name, plan_id)
    values (v_plan.team_id, null, v_root, v_name, p_plan)
    returning id into v_folder;
  end if;

  v_doc := v_plan.brief_id;
  if v_doc is null then
    insert into public.documents (team_id, workspace_id, folder_id, title)
    values (v_plan.team_id, null, v_folder, 'Brief')
    returning id into v_doc;
  end if;

  v_board := v_plan.whiteboard_id;
  if v_board is null and p_whiteboard then
    insert into public.diagrams (team_id, workspace_id, folder_id, title)
    values (v_plan.team_id, null, v_folder, 'Whiteboard')
    returning id into v_board;
  end if;

  update public.plans set folder_id = v_folder, brief_id = v_doc, whiteboard_id = v_board
   where id = p_plan and (folder_id, brief_id, whiteboard_id) is distinct from (v_folder, v_doc, v_board);
  perform set_config('devdock.plan_files', '', true);
end;
$$;

create or replace function private.plan_folder_follows_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.folder_id is not null then
    perform set_config('devdock.plan_files', 'on', true);
    update public.doc_folders set name = left(new.name, 100) where id = new.folder_id and name is distinct from left(new.name, 100);
    perform set_config('devdock.plan_files', '', true);
  end if;
  return null;
end;
$$;

create or replace function public.delete_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_me uuid := (select auth.uid());
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan.id is null
     or not (v_plan.lead_id = v_me or v_plan.created_by = v_me or private.is_team_admin(v_plan.team_id)) then
    raise exception 'Only the plan''s lead, whoever created it, and group owners/admins can delete it' using errcode = '42501';
  end if;
  perform set_config('devdock.plan_files', 'on', true);
  if v_plan.folder_id is not null then
    delete from public.documents d where d.folder_id in (
      with recursive tree as (
        select f.id from public.doc_folders f where f.id = v_plan.folder_id
        union all
        select f.id from public.doc_folders f join tree t on f.parent_id = t.id
      )
      select id from tree
    );
    delete from public.diagrams g where g.folder_id in (
      with recursive tree as (
        select f.id from public.doc_folders f where f.id = v_plan.folder_id
        union all
        select f.id from public.doc_folders f join tree t on f.parent_id = t.id
      )
      select id from tree
    );
    -- Its subfolders go with it (parent_id cascades).
    delete from public.doc_folders where id = v_plan.folder_id;
  end if;
  delete from public.plans where id = p_plan_id;
  perform set_config('devdock.plan_files', '', true);
end;
$$;
