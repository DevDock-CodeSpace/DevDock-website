import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import { errorMessage } from '@/lib/errors'
import {
  learningKeys,
  lessonsQuery,
  markLessonDone,
  markLessonNotDone,
  modulesQuery,
  myProgressQuery,
  type LearningModule,
  type LessonSummary,
} from './api'

export type OutlineModule = LearningModule & { lessons: LessonSummary[] }

/**
 * The course outline for the current workspace, in reading order, plus the
 * caller's progress. `canManage` mirrors private.can_manage_workspace (UI only).
 */
export function useLearning() {
  const { user } = useAuth()
  const { workspace, can } = useCurrentWorkspace()
  const modules = useSuspenseQuery(modulesQuery(workspace.id)).data
  const lessons = useSuspenseQuery(lessonsQuery(workspace.id)).data
  const doneIds = useSuspenseQuery(myProgressQuery(workspace.id, user.id)).data

  const outline: OutlineModule[] = modules.map((m) => ({
    ...m,
    lessons: lessons.filter((l) => l.module_id === m.id).sort((a, b) => a.position - b.position),
  }))
  /** Every lesson in reading order (module order, then lesson order). */
  const ordered = outline.flatMap((m) => m.lessons)
  const done = new Set(doneIds.filter((id) => ordered.some((l) => l.id === id)))

  return {
    workspace,
    userId: user.id,
    canManage: can.canEdit,
    outline,
    ordered,
    done,
    /** The first lesson not done yet, in reading order. */
    next: ordered.find((l) => !done.has(l.id)),
  }
}

/** Marks a lesson done / not done for the caller, instantly (rolls back with a toast on failure). */
export function useToggleDone() {
  const { user } = useAuth()
  const { workspace } = useCurrentWorkspace()
  const queryClient = useQueryClient()
  const key = learningKeys.myProgress(workspace.id, user.id)

  return useMutation({
    mutationFn: ({ lessonId, done }: { lessonId: string; done: boolean }) =>
      done ? markLessonDone(lessonId, workspace.id) : markLessonNotDone(lessonId, user.id),
    onMutate: async ({ lessonId, done }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<string[]>(key)
      queryClient.setQueryData<string[]>(key, (old = []) =>
        done ? [...new Set([...old, lessonId])] : old.filter((id) => id !== lessonId),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(errorMessage(error))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
      void queryClient.invalidateQueries({ queryKey: learningKeys.allProgress(workspace.id) })
    },
  })
}
