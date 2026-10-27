-- Lesson files (owner's choices, 2026-10-27): lessons keep their content the way plans do.
--
-- * Every lesson has a folder in its course's Files: the workspace's "Lessons" folder holds one
--   folder per lesson, named after it. The lesson's text is a doc "Lesson" in it (the lesson page
--   shows it), its whiteboard is a whiteboard in it (made when a teacher starts it), and teachers can
--   add more docs and whiteboards there; the lesson page shows those too.
-- * Students reach lesson files only through the lesson page: the app leaves the Lessons folder out
--   of Files for anyone who doesn't manage the course. (RLS still lets them read: the page needs it.)
-- * Only the course's managers (workspace leads, group owners/admins) change lesson files: inside the
--   Lessons folder everyone else is held to "can view" (private.file_level), whatever the usual rules
--   say (members edit workspace docs elsewhere).
-- * A lesson's files go when the lesson goes (documents.lesson_id and diagrams.lesson_id cascade, as
--   does its folder); the app removes the docs' images first.
-- * The Lessons folder and lesson folders follow their lessons: not renamed, moved or deleted by hand.
-- * Existing lessons move in now: their text becomes their Lesson doc, their whiteboard moves into
--   their folder. lessons.body stays (unwritable) until no tab from before this deploy is open.

-- ------------------------------------------------------------------ columns

alter table public.doc_folders
  add column lesson_id uuid,
  add column is_lessons_root boolean not null default false,
  add constraint doc_folders_lesson_fkey foreign key (lesson_id, workspace_id)
    references public.lessons (id, workspace_id) on delete cascade,
  add constraint doc_folders_lessons_in_workspace check ((lesson_id is null and not is_lessons_root) or workspace_id is not null);

create unique index doc_folders_lessons_root_key on public.doc_folders (workspace_id) where is_lessons_root;
create unique index doc_folders_lesson_key on public.doc_folders (lesson_id) where lesson_id is not null;

comment on column public.doc_folders.lesson_id is 'This folder is the lesson''s own (inside its workspace''s Lessons folder).';
comment on column public.doc_folders.is_lessons_root is 'The workspace''s "Lessons" folder, which holds one folder per lesson.';

alter table public.lessons
  add column folder_id uuid references public.doc_folders (id) on delete set null,
  add column doc_id uuid,
  add column whiteboard_id uuid references public.diagrams (id) on delete set null;

alter table public.lessons
  add constraint lessons_doc_id_fkey foreign key (doc_id) references public.documents (id) on delete set null;

create index lessons_folder_idx on public.lessons (folder_id);
create index lessons_doc_idx on public.lessons (doc_id);
create index lessons_whiteboard_idx on public.lessons (whiteboard_id);

comment on column public.lessons.body is 'Unused since 2026-10-27: the text is the lesson''s doc (doc_id). Drop once no older tab is open.';

-- Every file inside a lesson's folder (subfolders too) names the lesson, so lists can leave them out
-- and they go with it. Set by a trigger from the folder, never by clients.
alter table public.documents
  add column lesson_id uuid,
  add constraint documents_lesson_fkey foreign key (lesson_id, workspace_id)
    references public.lessons (id, workspace_id) on delete cascade;

create index documents_lesson_idx on public.documents (lesson_id);

-- Lesson whiteboards were kept out of folders; now they live in their lesson's.
alter table public.diagrams drop constraint diagrams_lesson_no_folder;
revoke insert (lesson_id) on table public.diagrams from authenticated;

comment on column public.diagrams.lesson_id is 'The lesson whose folder holds this whiteboard (set from its folder).';
comment on column public.documents.lesson_id is 'The lesson whose folder holds this doc (set from its folder).';

-- Text and links are written by the functions below now.
revoke insert (body) on table public.lessons from authenticated;
revoke update (body) on table public.lessons from authenticated;

-- ------------------------------------------------------------------ where a folder sits

-- The lesson a folder belongs to: its own, or the nearest folder above it that is a lesson's.
create function private.lesson_of_folder(f uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select d.id, d.parent_id, d.lesson_id, 1 as n from public.doc_folders d where d.id = f
    union all
    select d.id, d.parent_id, d.lesson_id, up.n + 1 from public.doc_folders d join up on d.id = up.parent_id where up.n < 4
  )
  select up.lesson_id from up where up.lesson_id is not null limit 1;
$$;

-- Is this folder the Lessons folder, or inside it?
create function private.in_lessons(f uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select d.id, d.parent_id, d.lesson_id, d.is_lessons_root, 1 as n from public.doc_folders d where d.id = f
    union all
    select d.id, d.parent_id, d.lesson_id, d.is_lessons_root, up.n + 1 from public.doc_folders d join up on d.id = up.parent_id where up.n < 4
  )
  select coalesce(bool_or(up.is_lessons_root or up.lesson_id is not null), false) from up;
$$;

revoke all on function private.lesson_of_folder(uuid), private.in_lessons(uuid) from public, anon, authenticated;
grant execute on function private.lesson_of_folder(uuid), private.in_lessons(uuid) to authenticated;

-- ------------------------------------------------------------------ the level, held to "view" in lessons

create or replace function private.file_level(
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

  -- Lesson files: only the course's managers change them; everyone else reads.
  if w is not null
     and (case when p_kind = 'folder' then p_item else p_folder end) is not null
     and not private.can_manage_workspace(w)
     and private.in_lessons(case when p_kind = 'folder' then p_item else p_folder end) then
    v_cap := 1;
  end if;

  -- Shared with the caller directly: that role, whatever is restricted around it.
  select s.role into v_role
    from public.file_shares s
   where s.user_id = me
     and case p_kind when 'doc' then s.document_id when 'diagram' then s.diagram_id else s.folder_id end = p_item;
  if v_role is not null then return least(v_cap, case v_role when 'editor' then 2 else 1 end); end if;

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

-- ------------------------------------------------------------------ files name their lesson

create function private.set_file_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.lesson_id := case when new.workspace_id is null or new.folder_id is null then null else private.lesson_of_folder(new.folder_id) end;
  return new;
end;
$$;

revoke all on function private.set_file_lesson() from public, anon, authenticated;
create trigger set_file_lesson before insert or update of folder_id on public.documents
  for each row execute function private.set_file_lesson();
create trigger set_file_lesson before insert or update of folder_id on public.diagrams
  for each row execute function private.set_file_lesson();

-- ------------------------------------------------------------------ folders follow their lessons

create function private.protect_lesson_folders()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (old.is_lessons_root or old.lesson_id is not null)
     and (select auth.uid()) is not null
     and coalesce(current_setting('devdock.lesson_files', true), '') <> 'on'
     and (tg_op = 'DELETE' or new.name is distinct from old.name or new.parent_id is distinct from old.parent_id or new.access is distinct from old.access) then
    -- Going with its lesson (or its workspace): the cascade is allowed.
    if tg_op = 'DELETE' and (
      (old.lesson_id is not null and not exists (select 1 from public.lessons l where l.id = old.lesson_id))
      or not exists (select 1 from public.workspaces w where w.id = old.workspace_id)
    ) then
      return old;
    end if;
    raise exception 'This folder belongs to a lesson: rename or delete the lesson instead' using errcode = 'DD003';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.protect_lesson_folders() from public, anon, authenticated;
create trigger protect_lesson_folders before update or delete on public.doc_folders
  for each row execute function private.protect_lesson_folders();

-- A lesson folder's name: the lesson's title, made unique beside its siblings ("Recap (2)").
create function private.lesson_folder_name(p_root uuid, p_title text, p_self uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text := left(btrim(p_title), 90);
  v_name text := v_base;
  n integer := 1;
begin
  while exists (
    select 1 from public.doc_folders f
     where f.parent_id = p_root and lower(btrim(f.name)) = lower(v_name) and f.id is distinct from p_self
  ) loop
    n := n + 1;
    v_name := v_base || ' (' || n || ')';
  end loop;
  return v_name;
end;
$$;

revoke all on function private.lesson_folder_name(uuid, text, uuid) from public, anon, authenticated;

-- A lesson's folder and Lesson doc (and, if asked, its Whiteboard). Idempotent: makes only what's
-- missing. A lesson's old text becomes its doc; its old whiteboard moves into its folder.
create function private.ensure_lesson_files(p_lesson uuid, p_whiteboard boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons;
  v_team uuid;
  v_root uuid;
  v_folder uuid;
  v_doc uuid;
  v_board uuid;
  v_text text;
begin
  select * into v_lesson from public.lessons where id = p_lesson;
  if v_lesson.id is null then return; end if;
  select w.team_id into v_team from public.workspaces w where w.id = v_lesson.workspace_id;
  perform set_config('devdock.lesson_files', 'on', true);

  select f.id into v_root from public.doc_folders f where f.workspace_id = v_lesson.workspace_id and f.is_lessons_root;
  if v_root is null then
    -- A top-level folder already called "Lessons" in the workspace becomes the Lessons folder.
    select f.id into v_root from public.doc_folders f
     where f.workspace_id = v_lesson.workspace_id and f.parent_id is null and lower(btrim(f.name)) = 'lessons';
    if v_root is not null then
      update public.doc_folders set is_lessons_root = true where id = v_root;
    else
      insert into public.doc_folders (team_id, workspace_id, parent_id, name, is_lessons_root)
      values (v_team, v_lesson.workspace_id, null, 'Lessons', true)
      returning id into v_root;
    end if;
  end if;

  v_folder := v_lesson.folder_id;
  if v_folder is null then
    select f.id into v_folder from public.doc_folders f where f.lesson_id = p_lesson;
  end if;
  if v_folder is null then
    insert into public.doc_folders (team_id, workspace_id, parent_id, name, lesson_id)
    values (v_team, v_lesson.workspace_id, v_root, private.lesson_folder_name(v_root, v_lesson.title, null), p_lesson)
    returning id into v_folder;
  end if;

  v_doc := v_lesson.doc_id;
  if v_doc is null then
    -- The plain-text copy (search, previews): every text node, in order.
    select string_agg(t #>> '{}', ' ') into v_text from jsonb_path_query(coalesce(v_lesson.body, '{}'::jsonb), 'strict $.**.text') t;
    insert into public.documents (team_id, workspace_id, folder_id, title, body, content)
    values (v_team, v_lesson.workspace_id, v_folder, 'Lesson', v_lesson.body, coalesce(v_text, ''))
    returning id into v_doc;
  end if;

  v_board := v_lesson.whiteboard_id;
  if v_board is null then
    -- A whiteboard started before lessons had folders.
    select d.id into v_board from public.diagrams d where d.lesson_id = p_lesson and d.folder_id is null limit 1;
    if v_board is not null then
      update public.diagrams set folder_id = v_folder where id = v_board;
    elsif p_whiteboard then
      insert into public.diagrams (team_id, workspace_id, folder_id, title)
      values (v_team, v_lesson.workspace_id, v_folder, 'Whiteboard')
      returning id into v_board;
    end if;
  end if;

  update public.lessons set folder_id = v_folder, doc_id = v_doc, whiteboard_id = v_board
   where id = p_lesson and (folder_id, doc_id, whiteboard_id) is distinct from (v_folder, v_doc, v_board);
  perform set_config('devdock.lesson_files', '', true);
end;
$$;

revoke all on function private.ensure_lesson_files(uuid, boolean) from public, anon, authenticated;
grant execute on function private.ensure_lesson_files(uuid, boolean) to authenticated;

-- Every new lesson gets its folder and Lesson doc (the whiteboard waits for a teacher to start it).
create function private.lesson_files_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ensure_lesson_files(new.id, false);
  return null;
end;
$$;

revoke all on function private.lesson_files_on_insert() from public, anon, authenticated;
create trigger lesson_files_on_insert after insert on public.lessons
  for each row execute function private.lesson_files_on_insert();

-- A lesson's folder is renamed with it.
create function private.lesson_folder_follows_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_root uuid;
begin
  if new.folder_id is not null and new.title is distinct from old.title then
    select f.parent_id into v_root from public.doc_folders f where f.id = new.folder_id;
    perform set_config('devdock.lesson_files', 'on', true);
    update public.doc_folders set name = private.lesson_folder_name(v_root, new.title, new.folder_id)
     where id = new.folder_id;
    perform set_config('devdock.lesson_files', '', true);
  end if;
  return null;
end;
$$;

revoke all on function private.lesson_folder_follows_title() from public, anon, authenticated;
create trigger lesson_folder_follows_title after update of title on public.lessons
  for each row execute function private.lesson_folder_follows_title();

-- Clients don't write the links; only the functions above do.
revoke update (folder_id, doc_id, whiteboard_id) on table public.lessons from authenticated;

-- ------------------------------------------------------------------ the app's ways in

-- A lesson's whiteboard, made when a teacher starts it. Returns its id.
create function public.lesson_whiteboard(p_lesson_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  select l.workspace_id into v_workspace from public.lessons l where l.id = p_lesson_id;
  if v_workspace is null or not private.can_manage_workspace(v_workspace) then
    raise exception 'Only the course''s lead and group owners/admins can start a lesson''s whiteboard' using errcode = '42501';
  end if;
  perform private.ensure_lesson_files(p_lesson_id, true);
  return (select l.whiteboard_id from public.lessons l where l.id = p_lesson_id);
end;
$$;

revoke all on function public.lesson_whiteboard(uuid) from public, anon;
grant execute on function public.lesson_whiteboard(uuid) to authenticated;

-- The docs in these lessons' folders (for removing their images before the lessons are deleted).
create function public.lesson_doc_ids(p_lesson_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(d.id), '{}')
    from public.documents d
    join public.lessons l on l.id = d.lesson_id
   where d.lesson_id = any(p_lesson_ids) and private.can_manage_workspace(l.workspace_id);
$$;

revoke all on function public.lesson_doc_ids(uuid[]) from public, anon;
grant execute on function public.lesson_doc_ids(uuid[]) to authenticated;

-- ------------------------------------------------------------------ existing lessons move in

-- Files already in a folder that is about to be a lesson's can't be (folders are new), so only the
-- lessons themselves: each gets its folder and doc, and keeps its whiteboard.
select private.ensure_lesson_files(l.id, false) from public.lessons l order by l.workspace_id, l.position;
-- Whiteboards moved into lesson folders keep naming their lesson (set_file_lesson did it on the move).
