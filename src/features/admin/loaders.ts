import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { queryClient } from '@/lib/query-client'
import { adminFeedbackQuery, adminFlagsQuery, adminGroupsQuery, adminOverviewQuery, adminUsersQuery, amPlatformAdminQuery } from './api'

/** /admin: platform admins only. Anyone else gets the same 404 as a page that doesn't exist. */
export async function adminLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const isAdmin = await queryClient.ensureQueryData(amPlatformAdminQuery(user.id))
  if (!isAdmin) throw data('Page not found.', { status: 404 })
  // The Feedback tab's count of new ones shows on every console page (and the Feedback page reads the same list).
  void queryClient.prefetchQuery(adminFeedbackQuery())
  return null
}

/**
 * Starts a page's data once the admin check (shared with adminLoader, so asked once and then cached)
 * says yes: anyone else would only collect a refusal from the database and an error in the console.
 */
async function prefetchForAdmin(request: Request, start: () => void) {
  const user = await requireUser(request)
  if (await queryClient.ensureQueryData(amPlatformAdminQuery(user.id))) start()
  return null
}

export const adminOverviewLoader = ({ request }: LoaderFunctionArgs) =>
  prefetchForAdmin(request, () => void queryClient.prefetchQuery(adminOverviewQuery()))
export const adminGroupsLoader = ({ request }: LoaderFunctionArgs) =>
  prefetchForAdmin(request, () => void queryClient.prefetchQuery(adminGroupsQuery()))
export const adminUsersLoader = ({ request }: LoaderFunctionArgs) =>
  prefetchForAdmin(request, () => void queryClient.prefetchQuery(adminUsersQuery()))
export const adminFlagsLoader = ({ request }: LoaderFunctionArgs) =>
  prefetchForAdmin(request, () => {
    void queryClient.prefetchQuery(adminFlagsQuery())
    void queryClient.prefetchQuery(adminGroupsQuery())
  })
export const adminFeedbackLoader = ({ request }: LoaderFunctionArgs) =>
  prefetchForAdmin(request, () => void queryClient.prefetchQuery(adminFeedbackQuery()))
