-- A lesson can have its own whiteboard (the UI's word for a diagram), shown on the lesson's
-- Whiteboard tab. It is an ordinary `diagrams` row with `lesson_id` set, so saving, the
-- one-editor lock, live updates and the writer rules all work as for any whiteboard:
--   * teachers draw (writers: group owners/admins and the workspace's leads, the same people who
--     edit lessons), and everyone who can open the course sees it;
--   * it belongs to the lesson's workspace (the composite key), one per lesson, and goes when the
--     lesson goes;
--   * it isn't listed in Files (the app filters `lesson_id is null`).

alter table public.diagrams add column lesson_id uuid;

alter table public.diagrams
  add constraint diagrams_lesson_fkey foreign key (lesson_id, workspace_id)
    references public.lessons (id, workspace_id) on delete cascade,
  -- MATCH SIMPLE skips the key when workspace_id is null, so a lesson board must name its workspace.
  add constraint diagrams_lesson_in_workspace check (lesson_id is null or workspace_id is not null),
  -- Lesson boards aren't filed: they live in their lesson.
  add constraint diagrams_lesson_no_folder check (lesson_id is null or folder_id is null);

create unique index diagrams_lesson_key on public.diagrams (lesson_id) where lesson_id is not null;

comment on column public.diagrams.lesson_id is 'Set for a lesson''s own whiteboard (one per lesson); such rows are not listed in Files.';

-- Set once, when the board is made; never moved to another lesson (no update grant).
grant insert (lesson_id) on table public.diagrams to authenticated;
