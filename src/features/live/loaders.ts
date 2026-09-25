import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { myTeamsQuery } from '@/features/teams/api'
import { queryClient } from '@/lib/query-client'
import { liveSessionQuery } from './api'

/**
 * …/live/:sessionId (group view or inside a workspace): 404 unless the session
 * is visible (RLS), belongs to this group, and (in a workspace) to that workspace.
 */
export async function liveSessionLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const [memberships, session] = await Promise.all([
    queryClient.ensureQueryData(myTeamsQuery(user.id)),
    queryClient.ensureQueryData(liveSessionQuery(params.sessionId ?? '')),
  ])
  const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
  const wrongWorkspace = params.workspaceId !== undefined && session?.workspace_id !== params.workspaceId
  if (!session || !team || session.team_id !== team.id || wrongWorkspace) {
    throw data('Session not found, or you don’t have access to it.', { status: 404 })
  }
  return null
}
