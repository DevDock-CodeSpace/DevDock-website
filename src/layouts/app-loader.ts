import type { LoaderFunctionArgs } from 'react-router'
import { profileQuery } from '@/features/auth/api'
import { requireUser } from '@/features/auth/loaders'
import { courseQuery, coursesQuery } from '@/features/courses/api'
import { DEMO_COURSE_ID } from '@/features/courses/mock-data'
import { queryClient } from '@/lib/query-client'

export const APP_ROUTE_ID = 'app'

/** Loader for the authenticated layout: guard first, then prime the query cache. */
export async function appLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)

  // Not awaited: the shell renders with Google account details until the profile arrives.
  void queryClient.prefetchQuery(profileQuery(user.id))
  await Promise.all([
    queryClient.ensureQueryData(coursesQuery),
    queryClient.ensureQueryData(courseQuery(params.courseId ?? DEMO_COURSE_ID)),
  ])
  return { user }
}
