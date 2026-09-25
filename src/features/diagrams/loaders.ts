import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { myTeamsQuery } from '@/features/teams/api'
import { queryClient } from '@/lib/query-client'
import { diagramQuery } from './api'

/**
 * …/diagrams/:diagramId (team view or inside a workspace): 404 unless the
 * diagram is readable (RLS), belongs to this team, and (in a workspace) to that workspace.
 */
export async function diagramLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const [memberships, diagram] = await Promise.all([
    queryClient.ensureQueryData(myTeamsQuery(user.id)),
    queryClient.ensureQueryData(diagramQuery(params.diagramId ?? '')),
  ])
  const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
  const wrongWorkspace = params.workspaceId !== undefined && diagram?.workspace_id !== params.workspaceId
  if (!diagram || !team || diagram.team_id !== team.id || wrongWorkspace) {
    throw data('Diagram not found, or you don’t have access to it.', { status: 404 })
  }
  return null
}
