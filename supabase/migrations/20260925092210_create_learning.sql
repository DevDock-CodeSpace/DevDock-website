-- Learning: a course outline of modules → ordered lessons, plus each
-- student's progress (lessons marked done).
--
-- Security:
--   * modules and lessons: anyone who can see the workspace reads them;
--     workspace managers (leads + team owners/admins) create, edit, reorder
--     and delete them
--   * progress: you mark and unmark your own lessons; you see your own
--     progress, and managers see everyone's in their workspace
--   * user_id / created_by default to the caller and can't be supplied;
--     positions are set by triggers or the reorder functions

-- ---------------------------------------------------------------------------
-- modules
-- ---------------------------------------------------------------------------
create table public.learning_modules (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title        text not null,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint learning_modules_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint learning_modules_id_workspace_key unique (id, workspace_id)
);

comment on table public.learning_modules is 'Course modules (Week 1, …) in a workspace, ordered by position.';

create index learning_modules_workspace_idx on public.learning_modules (workspace_id, position);

create trigger set_updated_at
  before update on public.learning_modules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lessons
-- ---------------------------------------------------------------------------
create table public.lessons (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  module_id    uuid not null,
  title        text not null,
  body         jsonb,
  position     integer not null default 0,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint lessons_title_length check (char_length(btrim(title)) between 1 and 200),
  constraint lessons_body_size check (body is null or octet_length(body::text) <= 1000000),
  constraint lessons_id_workspace_key unique (id, workspace_id),
  -- A lesson's module is in the same workspace; deleting a module deletes its lessons.
  constraint lessons_module_fkey foreign key (module_id, workspace_id)
    references public.learning_modules (id, workspace_id) on delete cascade
);

comment on table public.lessons is 'Lessons in a module, ordered by position. body is TipTap JSON (same format as documents.body).';

create index lessons_module_idx on public.lessons (module_id, position);
create index lessons_workspace_idx on public.lessons (workspace_id);
create index lessons_created_by_idx on public.lessons (created_by);

create trigger set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

-- New modules and lessons go to the end of their list. security definer so the
-- max() sees every row (the caller can, but this doesn't depend on it).
create function private.position_learning_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'learning_modules' then
    select coalesce(max(m.position), -1) + 1 into new.position
    from public.learning_modules m where m.workspace_id = new.workspace_id;
  elsif tg_op = 'INSERT' or new.module_id is distinct from old.module_id then
    -- New lesson, or moved to another module: last in that module.
    select coalesce(max(l.position), -1) + 1 into new.position
    from public.lessons l where l.module_id = new.module_id;
  end if;
  return new;
end;
$$;

create trigger position_learning_module
  before insert on public.learning_modules
  for each row execute function private.position_learning_item();

create trigger position_lesson
  before insert or update of module_id on public.lessons
  for each row execute function private.position_learning_item();

-- ---------------------------------------------------------------------------
-- progress
-- ---------------------------------------------------------------------------
create table public.lesson_progress (
  lesson_id    uuid not null,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  workspace_id uuid not null,
  completed_at timestamptz not null default now(),
  primary key (lesson_id, user_id),
  constraint lesson_progress_lesson_fkey foreign key (lesson_id, workspace_id)
    references public.lessons (id, workspace_id) on delete cascade
);

comment on table public.lesson_progress is 'A lesson marked done by a user.';

create index lesson_progress_workspace_idx on public.lesson_progress (workspace_id);
create index lesson_progress_user_idx on public.lesson_progress (user_id);

-- ---------------------------------------------------------------------------
-- Reordering (security invoker: RLS applies, so only managers change anything)
-- ---------------------------------------------------------------------------
-- Sets each module's position to its index in p_ids.
create function public.reorder_learning_modules(p_workspace_id uuid, p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.learning_modules m
  set position = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where m.id = o.id and m.workspace_id = p_workspace_id;
$$;

-- Sets each lesson's position within the module to its index in p_ids.
create function public.reorder_lessons(p_module_id uuid, p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.lessons l
  set position = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where l.id = o.id and l.module_id = p_module_id;
$$;

revoke all on function public.reorder_learning_modules(uuid, uuid[]), public.reorder_lessons(uuid, uuid[])
  from public, anon;
grant execute on function public.reorder_learning_modules(uuid, uuid[]), public.reorder_lessons(uuid, uuid[])
  to authenticated;
revoke all on function private.position_learning_item() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.learning_modules, public.lessons, public.lesson_progress from anon, authenticated;

grant select, delete on table public.learning_modules to authenticated;
grant insert (workspace_id, title), update (title, position) on table public.learning_modules to authenticated;

grant select, delete on table public.lessons to authenticated;
grant insert (workspace_id, module_id, title, body), update (module_id, title, body, position)
  on table public.lessons to authenticated;

grant select, delete on table public.lesson_progress to authenticated;
grant insert (lesson_id, workspace_id) on table public.lesson_progress to authenticated;

alter table public.learning_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;

create policy "Workspace viewers can see modules"
  on public.learning_modules for select to authenticated
  using (private.can_view_workspace(workspace_id));
create policy "Workspace managers can create modules"
  on public.learning_modules for insert to authenticated
  with check (private.can_manage_workspace(workspace_id));
create policy "Workspace managers can edit modules"
  on public.learning_modules for update to authenticated
  using (private.can_manage_workspace(workspace_id))
  with check (private.can_manage_workspace(workspace_id));
create policy "Workspace managers can delete modules"
  on public.learning_modules for delete to authenticated
  using (private.can_manage_workspace(workspace_id));

create policy "Workspace viewers can see lessons"
  on public.lessons for select to authenticated
  using (private.can_view_workspace(workspace_id));
create policy "Workspace managers can create lessons"
  on public.lessons for insert to authenticated
  with check (private.can_manage_workspace(workspace_id));
create policy "Workspace managers can edit lessons"
  on public.lessons for update to authenticated
  using (private.can_manage_workspace(workspace_id))
  with check (private.can_manage_workspace(workspace_id));
create policy "Workspace managers can delete lessons"
  on public.lessons for delete to authenticated
  using (private.can_manage_workspace(workspace_id));

create policy "People see their own progress; managers see everyone's"
  on public.lesson_progress for select to authenticated
  using (
    (user_id = (select auth.uid()) and private.can_view_workspace(workspace_id))
    or private.can_manage_workspace(workspace_id)
  );
create policy "People mark their own lessons done"
  on public.lesson_progress for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_view_workspace(workspace_id));
create policy "People unmark their own lessons"
  on public.lesson_progress for delete to authenticated
  using (user_id = (select auth.uid()));
