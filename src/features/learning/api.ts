import { queryOptions } from '@tanstack/react-query'
import type { PersonProfile } from '@/features/teams/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database.types'

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
/** body is TipTap JSON (null = empty). */
export type Lesson = LessonSummary & { body: Json | null; author: PersonProfile }
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

/** null when the lesson doesn't exist or the caller can't see it. */
export const lessonQuery = (lessonId: string) =>
  queryOptions({
    queryKey: learningKeys.lesson(lessonId),
    queryFn: async (): Promise<Lesson | null> => {
      const { data, error } = await supabase
        .from('lessons')
        .select(`${LESSON_COLUMNS}, body, author:profiles!lessons_created_by_fkey(display_name, avatar_url)`)
        .eq('id', lessonId)
        .maybeSingle()
      if (error) throw toDataError('load the lesson', error)
      return data
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

/** Deletes the module, its lessons, and everyone's progress on them. */
export async function deleteModule(moduleId: string) {
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

export async function updateLesson(lessonId: string, patch: { title?: string; body?: Json | null }) {
  const update = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() }
  const { data, error } = await supabase.from('lessons').update(update).eq('id', lessonId).select('id')
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

export async function deleteLesson(lessonId: string) {
  const { data, error } = await supabase.from('lessons').delete().eq('id', lessonId).select('id')
  if (error) throw toDataError('delete the lesson', error, writeErrors)
  requireAffected(data, 'delete lesson')
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
