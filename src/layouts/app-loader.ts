import type { LoaderFunctionArgs } from 'react-router'
import { profileQuery } from '@/features/auth/api'
import { requireUser } from '@/features/auth/loaders'
import { preferencesQuery } from '@/features/messaging/api'
import { queryClient } from '@/lib/query-client'

export const APP_ROUTE_ID = 'app'

/**
 * Root of every authenticated route: guard first, then start what the shell reads that needs only the
 * user, alongside the groups `teamLoader` asks for. Without this the sidebar asked for its pins only
 * after the workspace list arrived, and the bell and Starred only after that: four rounds before a
 * page showed on a cold load (2026-10-27, ~2.6 s throttled). None of these are awaited.
 */
export async function appLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  // The shell renders with Google account details until the profile arrives.
  void queryClient.prefetchQuery(profileQuery(user.id))
  void queryClient.prefetchQuery(preferencesQuery())
  return { user }
}
