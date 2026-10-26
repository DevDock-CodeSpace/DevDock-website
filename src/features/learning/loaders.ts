import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { queryClient } from '@/lib/query-client'
import { lessonQuery } from './api'
import { lessonView } from './screens'

/** …/w/:workspaceId/learning/:lessonId: 404 unless the lesson exists in this workspace (RLS hides others). */
export async function lessonLoader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request)
  // The editor's code downloads alongside the lesson, so the page renders without waiting on it.
  const [lesson] = await Promise.all([queryClient.ensureQueryData(lessonQuery(params.lessonId ?? '')), lessonView.preload()])
  if (!lesson || lesson.workspace_id !== params.workspaceId) {
    throw data('Lesson not found, or you don’t have access to it.', { status: 404 })
  }
  return null
}
