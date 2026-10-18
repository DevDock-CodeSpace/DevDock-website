import type { LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { myTeamsQuery } from '@/features/teams/api'
import { queryClient } from '@/lib/query-client'
import { remindersPageQuery } from './api'

/**
 * /t/:teamSlug/reminders: starts Upcoming and Completed together (two requests side by side) and
 * doesn't wait for them, so the page opens at once. Cancelled loads only when it's asked for.
 */
export async function remindersLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const memberships = await queryClient.ensureQueryData(myTeamsQuery(user.id))
  const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
  // teamLoader 404s an unknown group; nothing to start here then.
  if (team) {
    void queryClient.prefetchInfiniteQuery(remindersPageQuery(team.id, user.id, 'pending'))
    void queryClient.prefetchInfiniteQuery(remindersPageQuery(team.id, user.id, 'completed'))
  }
  return null
}
