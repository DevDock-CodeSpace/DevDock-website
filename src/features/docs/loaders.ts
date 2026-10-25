import { data, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { myTeamsQuery } from '@/features/teams/api'
import { workspaceQuery } from '@/features/workspaces/api'
import { queryClient } from '@/lib/query-client'
import { documentQuery, foldersQuery, teamDocsQuery } from './api'

/**
 * Files only changes its search params as you switch view, place or folder (?view= ?in= ?folder=):
 * the page reads those itself, so the loader needn't run again. (Re-running it rebuilt the page
 * under an open place dropdown, which then closed on its first click.)
 */
export const filesShouldRevalidate = ({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) =>
  currentUrl.pathname === nextUrl.pathname ? false : defaultShouldRevalidate

/**
 * Files (…/docs, group or workspace): the page is a lazy chunk, so this starts its queries at the
 * same time as that chunk instead of after it (no waterfall). The page reads the same queries.
 */
export async function filesLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  if (params.workspaceId) {
    const workspace = await queryClient.ensureQueryData(workspaceQuery(params.workspaceId))
    if (!workspace) return null
    // Files reads the group's lists everywhere (shared with links and the group page), plus this place's folders.
    await Promise.all([
      queryClient.prefetchQuery(teamDocsQuery(workspace.team_id)),
      queryClient.prefetchQuery(teamDiagramsQuery(workspace.team_id)),
      queryClient.prefetchQuery(foldersQuery(workspace.team_id, workspace.id)),
    ])
    return null
  }
  const memberships = await queryClient.ensureQueryData(myTeamsQuery(user.id))
  const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
  if (!team) return null
  await Promise.all([
    queryClient.prefetchQuery(teamDocsQuery(team.id)),
    queryClient.prefetchQuery(teamDiagramsQuery(team.id)),
    queryClient.prefetchQuery(foldersQuery(team.id, null)),
  ])
  return null
}

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
