import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { queryClient } from '@/lib/query-client'
import { documentQuery } from '@/features/docs/api'
import { allProgressQuery, lessonQuery, lessonsQuery, modulesQuery, myProgressQuery } from './api'
import { lessonView } from './screens'

/**
 * …/w/:workspaceId/learning/*: the outline and your progress start with the workspace (useLearning reads
 * them on every Learning page, lessons included), and Class progress adds everyone's. They used to start
 * one after another as each rendered.
 */
export async function learningLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const workspaceId = params.workspaceId ?? ''
  void queryClient.prefetchQuery(modulesQuery(workspaceId))
  void queryClient.prefetchQuery(lessonsQuery(workspaceId))
  void queryClient.prefetchQuery(myProgressQuery(workspaceId, user.id))
  if (new URL(request.url).pathname.endsWith('/learning/progress')) void queryClient.prefetchQuery(allProgressQuery(workspaceId))
  return null
}

/** …/w/:workspaceId/learning/:lessonId: 404 unless the lesson exists in this workspace (RLS hides others). */
export async function lessonLoader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request)
  // The editor's code downloads alongside the lesson, so the page renders without waiting on it.
  const [lesson] = await Promise.all([queryClient.ensureQueryData(lessonQuery(params.lessonId ?? '')), lessonView.preload()])
  if (!lesson || lesson.workspace_id !== params.workspaceId) {
    throw data('Lesson not found, or you don’t have access to it.', { status: 404 })
  }
  // Its text came with it: the docs editor reads it from the doc's own cache entry (live updates use it).
  if (lesson.doc) queryClient.setQueryData(documentQuery(lesson.doc.id).queryKey, (cached) => cached ?? lesson.doc)
  return null
}
