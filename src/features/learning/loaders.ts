import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { queryClient } from '@/lib/query-client'
import { lessonQuery } from './api'

/** …/w/:workspaceId/learning/:lessonId: 404 unless the lesson exists in this workspace (RLS hides others). */
export async function lessonLoader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request)
  const lesson = await queryClient.ensureQueryData(lessonQuery(params.lessonId ?? ''))
  if (!lesson || lesson.workspace_id !== params.workspaceId) {
    throw data('Lesson not found, or you don’t have access to it.', { status: 404 })
  }
  return null
}
