import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { myTeamsQuery } from '@/features/teams/api'
import { queryClient } from '@/lib/query-client'
import { documentQuery } from './api'

/**
 * …/docs/:docId (team view or inside a workspace): 404 unless the doc is
 * readable (RLS), belongs to this team, and (in a workspace) to that workspace.
 */
export async function docLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const [memberships, doc] = await Promise.all([
    queryClient.ensureQueryData(myTeamsQuery(user.id)),
    queryClient.ensureQueryData(documentQuery(params.docId ?? '')),
  ])
  const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
  const wrongWorkspace = params.workspaceId !== undefined && doc?.workspace_id !== params.workspaceId
  if (!doc || !team || doc.team_id !== team.id || wrongWorkspace) {
    throw data('Doc not found, or you don’t have access to it.', { status: 404 })
  }
  return null
}
