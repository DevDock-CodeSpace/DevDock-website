import { queryOptions } from '@tanstack/react-query'
import { DOC_SUMMARY, removeDocImages, type Doc } from '@/features/docs/api'
import type { PersonProfile } from '@/features/teams/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

// Learning: modules → ordered lessons, and each person's lessons marked done.
// Everyone in the workspace reads the outline; leads and group owners/admins
// edit it. You see your own progress; managers see everyone's (RLS).

export type LearningModule = { id: string; workspace_id: string; title: string; position: number }
export type LessonSummary = {
  id: string
  workspace_id: string
  module_id: string
  title: string
  position: number
  updated_at: string
}
/** A file in a lesson's folder (besides its Lesson doc and Whiteboard): shown as a tab on the lesson page. */
export type LessonFile = { id: string; kind: 'doc' | 'diagram'; title: string; created_at: string }
/**
 * A lesson and its files (owner's choice, 2026-10-27): its text is the doc "Lesson" in its folder in
 * the course's Files (`doc`, loaded with it), its whiteboard is a whiteboard there (made when a teacher
 * starts it), and teachers can add more files there (`files`).
 */
export type Lesson = LessonSummary & {
  author: PersonProfile
  folder_id: string | null
  doc_id: string | null
  whiteboard_id: string | null
  doc: Doc | null
  files: LessonFile[]
}
export type ProgressRow = { user_id: string; lesson_id: string; completed_at: string }

export const learningKeys = {
  all: ['learning'] as const,
  modules: (workspaceId: string) => ['learning', 'modules', workspaceId] as const,
  lessons: (workspaceId: string) => ['learning', 'lessons', workspaceId] as const,
  lesson: (lessonId: string) => ['learning', 'lesson', lessonId] as const,
  myProgress: (workspaceId: string, userId: string) => ['learning', 'progress', workspaceId, userId] as const,
  allProgress: (workspaceId: string) => ['learning', 'progress', workspaceId, 'all'] as const,
}

const writeErrors = { '42501': 'Only the workspace lead and group owners/admins can change the course.' }
const LESSON_COLUMNS = 'id, workspace_id, module_id, title, position, updated_at'

// ---------------------------------------------------------------- queries

export const modulesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: learningKeys.modules(workspaceId),
    queryFn: async (): Promise<LearningModule[]> => {
      const { data, error } = await supabase
        .from('learning_modules')
        .select('id, workspace_id, title, position')
        .eq('workspace_id', workspaceId)
        .order('position')
      if (error) throw toDataError('load the course', error)
      return data
    },
  })

/** Every lesson in the workspace, without bodies. */
export const lessonsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: learningKeys.lessons(workspaceId),
    queryFn: async (): Promise<LessonSummary[]> => {
      const { data, error } = await supabase
        .from('lessons')
        .select(LESSON_COLUMNS)
        .eq('workspace_id', workspaceId)
        .order('position')
      if (error) throw toDataError('load lessons', error)
      return data
    },
  })

type LessonRow = Omit<Lesson, 'files'> & {
  docs: { id: string; title: string; created_at: string }[]
  boards: { id: string; title: string; created_at: string }[]
}

/**
 * null when the lesson doesn't exist or the caller can't see it. One request brings the lesson, its
 * Lesson doc (whole, as `documentQuery` has it: lessonLoader puts it in that cache) and the other
 * files in its folder.
 */
export const lessonQuery = (lessonId: string) =>
  queryOptions({
    queryKey: learningKeys.lesson(lessonId),
    queryFn: async (): Promise<Lesson | null> => {
      const { data, error } = await supabase
        .from('lessons')
        .select(
          `${LESSON_COLUMNS}, folder_id, doc_id, whiteboard_id, author:profiles!lessons_created_by_fkey(display_name, avatar_url), doc:documents!lessons_doc_id_fkey(${DOC_SUMMARY}, content, body, access_level), docs:documents!documents_lesson_fkey(id, title, created_at), boards:diagrams!diagrams_lesson_fkey(id, title, created_at)`,
        )
        .eq('id', lessonId)
        .maybeSingle()
        // access_level is a computed column (public.access_level); the generated types can't see it.
        .overrideTypes<LessonRow, { merge: false }>()
      if (error) throw toDataError('load the lesson', error)
      if (!data) return null
      const { docs, boards, ...lesson } = data
      const files: LessonFile[] = [
        ...docs.filter((d) => d.id !== lesson.doc_id).map((d) => ({ ...d, kind: 'doc' as const })),
        ...boards.filter((b) => b.id !== lesson.whiteboard_id).map((b) => ({ ...b, kind: 'diagram' as const })),
      ].sort((a, b) => a.created_at.localeCompare(b.created_at))
      return { ...lesson, files }
    },
  })

/** Lesson ids the caller has marked done. */
export const myProgressQuery = (workspaceId: string, userId: string) =>
  queryOptions({
    queryKey: learningKeys.myProgress(workspaceId, userId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('lesson_id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
      if (error) throw toDataError('load your progress', error)
      return data.map((row) => row.lesson_id)
    },
  })

/** Everyone's progress (managers; RLS returns only your own rows otherwise). */
export const allProgressQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: learningKeys.allProgress(workspaceId),
    queryFn: async (): Promise<ProgressRow[]> => {
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('user_id, lesson_id, completed_at')
        .eq('workspace_id', workspaceId)
      if (error) throw toDataError('load progress', error)
      return data
    },
  })

// -------------------------------------------------------------- mutations
// Positions are set by the database: new items go last; reorder with the RPCs.

export async function createModule(workspaceId: string, title: string) {
  const { error } = await supabase.from('learning_modules').insert({ workspace_id: workspaceId, title: title.trim() })
  if (error) throw toDataError('create the module', error, writeErrors)
}

export async function renameModule(moduleId: string, title: string) {
  const { data, error } = await supabase
    .from('learning_modules')
    .update({ title: title.trim() })
    .eq('id', moduleId)
    .select('id')
  if (error) throw toDataError('rename the module', error, writeErrors)
  requireAffected(data, 'rename module')
}

/** Deletes the module, its lessons (with their files), and everyone's progress on them. */
export async function deleteModule(teamId: string, moduleId: string, lessonIds: string[]) {
  await removeLessonImages(teamId, lessonIds)
  const { data, error } = await supabase.from('learning_modules').delete().eq('id', moduleId).select('id')
  if (error) throw toDataError('delete the module', error, writeErrors)
  requireAffected(data, 'delete module')
}

export async function reorderModules(workspaceId: string, ids: string[]) {
  const { error } = await supabase.rpc('reorder_learning_modules', { p_workspace_id: workspaceId, p_ids: ids })
  if (error) throw toDataError('reorder the modules', error, writeErrors)
}

export async function createLesson(workspaceId: string, moduleId: string, title: string): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('lessons')
    .insert({ workspace_id: workspaceId, module_id: moduleId, title: title.trim() })
    .select('id')
    .single()
  if (error) throw toDataError('create the lesson', error, writeErrors)
  return data
}

/** Renames a lesson (its folder in Files follows). Its text is its doc's, saved by the docs editor. */
export async function renameLesson(lessonId: string, title: string) {
  const { data, error } = await supabase.from('lessons').update({ title: title.trim() }).eq('id', lessonId).select('id')
  if (error) throw toDataError('save the lesson', error, writeErrors)
  requireAffected(data, 'update lesson')
}

/** Moves a lesson to the end of another module. */
export async function moveLesson(lessonId: string, moduleId: string) {
  const { data, error } = await supabase.from('lessons').update({ module_id: moduleId }).eq('id', lessonId).select('id')
  if (error) throw toDataError('move the lesson', error, writeErrors)
  requireAffected(data, 'move lesson')
}

export async function reorderLessons(moduleId: string, ids: string[]) {
  const { error } = await supabase.rpc('reorder_lessons', { p_module_id: moduleId, p_ids: ids })
  if (error) throw toDataError('reorder the lessons', error, writeErrors)
}

/** Deletes the lesson with its files (its folder's docs and whiteboards go with it). */
export async function deleteLesson(teamId: string, lessonId: string) {
  await removeLessonImages(teamId, [lessonId])
  const { data, error } = await supabase.from('lessons').delete().eq('id', lessonId).select('id')
  if (error) throw toDataError('delete the lesson', error, writeErrors)
  requireAffected(data, 'delete lesson')
}

/** Starts a lesson's whiteboard in its folder (teachers); returns its id. */
export async function startLessonWhiteboard(lessonId: string): Promise<string> {
  const { data, error } = await supabase.rpc('lesson_whiteboard', { p_lesson_id: lessonId })
  if (error) throw toDataError('start the whiteboard', error, writeErrors)
  return data
}

/** Images in the lessons' docs live in Storage, which a database delete can't reach: they go first. */
async function removeLessonImages(teamId: string, lessonIds: string[]) {
  if (lessonIds.length === 0) return
  const { data, error } = await supabase.rpc('lesson_doc_ids', { p_lesson_ids: lessonIds })
  if (error) throw toDataError('delete the lesson’s files', error, writeErrors)
  await Promise.all(data.map((docId) => removeDocImages(teamId, docId)))
}

/** user_id is the caller (database default). */
export async function markLessonDone(lessonId: string, workspaceId: string) {
  const { error } = await supabase.from('lesson_progress').insert({ lesson_id: lessonId, workspace_id: workspaceId })
  // Already done (e.g. another tab) is fine.
  if (error && error.code !== '23505') throw toDataError('save your progress', error)
}

export async function markLessonNotDone(lessonId: string, userId: string) {
  const { error } = await supabase.from('lesson_progress').delete().eq('lesson_id', lessonId).eq('user_id', userId)
  if (error) throw toDataError('save your progress', error)
}
