-- Plan files (owner's choices, 2026-10-27; docs/ISSUES_HUB_PLAN.md):
--
-- * Every plan has a folder in Files: the group's "Plans" folder holds one folder per plan, named
--   after it. A plan starts with a doc "Brief" (what the plan is for; the plan page shows it) and,
--   when made with New plan, a "Whiteboard". Plans that arrive with an import get their folder and
--   Brief; their whiteboard is made the first time someone opens it (public.plan_whiteboard).
-- * Everyone in the group edits a plan's files: docs already (group-wide docs are editable by every
--   member); here whiteboards in a plan's folder too, and images in its docs. Deleting a single file
--   stays with writers (group owners/admins), as everywhere in Files.
-- * Deleting a plan deletes its folder and everything in it (public.delete_plan; the app warns first
--   and removes the docs' images beforehand). Its issues stay, without a plan.
-- * The Plans folder and plan folders aren't renamed, moved or deleted by hand: a plan's folder
--   follows its plan (renamed with it, gone with it).

alter table public.doc_folders
  add column plan_id uuid references public.plans (id) on delete set null,
  add column is_plans_root boolean not null default false;

create unique index doc_folders_plans_root_key on public.doc_folders (team_id) where is_plans_root;
create unique index doc_folders_plan_key on public.doc_folders (plan_id) where plan_id is not null;

comment on column public.doc_folders.plan_id is 'This folder is the plan''s own (inside the group''s Plans folder).';
comment on column public.doc_folders.is_plans_root is 'The group''s "Plans" folder, which holds one folder per plan.';

alter table public.plans
  add column folder_id uuid references public.doc_folders (id) on delete set null,
  add column brief_id uuid references public.documents (id) on delete set null,
  add column whiteboard_id uuid references public.diagrams (id) on delete set null;

create index plans_folder_idx on public.plans (folder_id);
create index plans_brief_idx on public.plans (brief_id);
create index plans_whiteboard_idx on public.plans (whiteboard_id);

-- ---------------------------------------------------------------------------------------------------
-- Which plan a folder belongs to: its own, or the nearest folder above it that is a plan's (folders
-- nest at most 3 levels).

create function private.plan_of_folder(f uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select d.id, d.parent_id, d.plan_id, 1 as n from public.doc_folders d where d.id = f
    union all
    select d.id, d.parent_id, d.plan_id, up.n + 1 from public.doc_folders d join up on d.id = up.parent_id where up.n < 4
  )
  select up.plan_id from up where up.plan_id is not null limit 1;
$$;

revoke all on function private.plan_of_folder(uuid) from public, anon, authenticated;
grant execute on function private.plan_of_folder(uuid) to authenticated;

-- Whiteboards in a plan's folder: every member of the group creates and edits them.
drop policy "Writers can create diagrams" on public.diagrams;
create policy "Writers can create diagrams" on public.diagrams for insert to authenticated
  with check (
    (private.can_write_document(team_id, workspace_id)
      or (workspace_id is null and folder_id is not null and private.is_team_member(team_id) and private.plan_of_folder(folder_id) is not null))
    and (folder_id is null or private.folder_level(folder_id) >= 2)
  );

drop policy "Writers can edit diagrams" on public.diagrams;
create policy "Writers can edit diagrams" on public.diagrams for update to authenticated
  using (
    (private.file_level(team_id, workspace_id, folder_id, access, created_by, 'diagram', id) = 3
      and (private.can_write_document(team_id, workspace_id)
        or (workspace_id is null and folder_id is not null and private.plan_of_folder(folder_id) is not null)))
    or private.file_level(team_id, workspace_id, folder_id, access, created_by, 'diagram', id) = 2
  )
  with check (private.can_read_document(team_id, workspace_id));

-- Images in a plan's docs: everyone who can edit them adds and removes images (the Brief is shared).
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
          and (private.can_write_document(d.team_id, d.workspace_id)
            or (d.workspace_id is null and d.folder_id is not null and private.is_team_member(d.team_id) and private.plan_of_folder(d.folder_id) is not null))
        else private.file_level(d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by, 'doc', d.id) >= 1
      end
  );
$$;

-- ---------------------------------------------------------------------------------------------------
-- The Plans folder and plan folders follow their plans. People can't rename, move or delete them;
-- the functions below can (devdock.plan_files = 'on' for the statement).

create function private.protect_plan_folders()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.is_plans_root or old.plan_id is not null)
     and (select auth.uid()) is not null
     and coalesce(current_setting('devdock.plan_files', true), '') <> 'on'
     and (tg_op = 'DELETE' or new.name is distinct from old.name or new.parent_id is distinct from old.parent_id or new.access is distinct from old.access) then
    raise exception 'This folder belongs to a plan: rename or delete the plan instead' using errcode = 'DD002';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.protect_plan_folders() from public, anon, authenticated;
create trigger protect_plan_folders before update or delete on public.doc_folders
  for each row execute function private.protect_plan_folders();

-- A plan's folder and Brief (and, if asked, its Whiteboard). Idempotent: makes only what's missing.
create function private.ensure_plan_files(p_plan uuid, p_whiteboard boolean)
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
end;
$$;

revoke all on function private.ensure_plan_files(uuid, boolean) from public, anon, authenticated;
grant execute on function private.ensure_plan_files(uuid, boolean) to authenticated;

-- Every new plan gets its folder and Brief (New plan adds the Whiteboard: devdock.plan_whiteboard).
create function private.plan_files_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_plan_files(new.id, coalesce(current_setting('devdock.plan_whiteboard', true), '') = 'on');
  return null;
end;
$$;

revoke all on function private.plan_files_on_insert() from public, anon, authenticated;
create trigger plan_files_on_insert after insert on public.plans
  for each row execute function private.plan_files_on_insert();

-- A plan's folder is renamed with it.
create function private.plan_folder_follows_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.folder_id is not null then
    perform set_config('devdock.plan_files', 'on', true);
    update public.doc_folders set name = left(new.name, 100) where id = new.folder_id and name is distinct from left(new.name, 100);
  end if;
  return null;
end;
$$;

revoke all on function private.plan_folder_follows_name() from public, anon, authenticated;
create trigger plan_folder_follows_name after update of name on public.plans
  for each row execute function private.plan_folder_follows_name();

-- Clients don't write the links; only the functions above do.
revoke update (folder_id, brief_id, whiteboard_id) on table public.plans from authenticated;

-- ---------------------------------------------------------------------------------------------------
-- The app's ways in.

-- New plan: the plan with its folder, Brief and Whiteboard. Anyone in the group (the plans insert
-- policy decides). Returns the plan's id.
create function public.create_plan(p_team_id uuid, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform set_config('devdock.plan_whiteboard', 'on', true);
  insert into public.plans (team_id, name) values (p_team_id, p_name) returning id into v_id;
  perform set_config('devdock.plan_whiteboard', '', true);
  return v_id;
end;
$$;

revoke all on function public.create_plan(uuid, text) from public, anon;
grant execute on function public.create_plan(uuid, text) to authenticated;

-- A plan's whiteboard, made the first time someone in the group opens it. Returns its id.
create function public.plan_whiteboard(p_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  select p.team_id into v_team from public.plans p where p.id = p_plan_id;
  if v_team is null or not private.is_team_member(v_team) then
    raise exception 'Plan not found' using errcode = '42501';
  end if;
  perform private.ensure_plan_files(p_plan_id, true);
  return (select p.whiteboard_id from public.plans p where p.id = p_plan_id);
end;
$$;

revoke all on function public.plan_whiteboard(uuid) from public, anon;
grant execute on function public.plan_whiteboard(uuid) to authenticated;

-- What deleting a plan takes with it: its folder's docs (ids, for their images), whiteboards and subfolders.
create function public.plan_files(p_plan_id uuid)
returns table (doc_ids uuid[], whiteboards integer, folders integer)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive tree as (
    select f.id from public.doc_folders f join public.plans p on p.folder_id = f.id
     where p.id = p_plan_id and private.is_team_member(p.team_id)
    union all
    select f.id from public.doc_folders f join tree t on f.parent_id = t.id
  )
  select
    coalesce((select array_agg(d.id) from public.documents d where d.folder_id in (select id from tree)), '{}'),
    (select count(*)::integer from public.diagrams g where g.folder_id in (select id from tree)),
    greatest((select count(*)::integer from tree) - 1, 0);
$$;

revoke all on function public.plan_files(uuid) from public, anon;
grant execute on function public.plan_files(uuid) to authenticated;

-- Deletes the plan and everything in its folder. Its lead, its creator and group owners/admins (the
-- plans delete rule). The app removes the docs' images first (it may: they're plan docs).
create function public.delete_plan(p_plan_id uuid)
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
end;
$$;

revoke all on function public.delete_plan(uuid) from public, anon;
grant execute on function public.delete_plan(uuid) to authenticated;

-- Plans made before this: their folder and Brief now (as the table owner, so no caller checks apply).
select private.ensure_plan_files(p.id, false) from public.plans p;
