import type { LoaderFunctionArgs } from 'react-router'
import { profileQuery } from '@/features/auth/api'
import { requireUser } from '@/features/auth/loaders'
import { queryClient } from '@/lib/query-client'

export const APP_ROUTE_ID = 'app'

/** Root of every authenticated route: guard first, then warm the profile. */
export async function appLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  // Not awaited: the shell renders with Google account details until the profile arrives.
  void queryClient.prefetchQuery(profileQuery(user.id))
  return { user }
}
