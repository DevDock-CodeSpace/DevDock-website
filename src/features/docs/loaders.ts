import { data, type LoaderFunctionArgs, type ShouldRevalidateFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { myTeamsQuery } from '@/features/teams/api'
import { queryClient } from '@/lib/query-client'
import { documentQuery, foldersQuery, teamDocsQuery } from './api'
import { docView } from './screens'

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
  // The group comes from the URL (its id is in the cached memberships), so a workspace's Files doesn't wait
  // for the workspace row first; workspaceLoader checks the workspace belongs to this group.
  const memberships = await queryClient.ensureQueryData(myTeamsQuery(user.id))
  const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
  if (!team) return null
  // Files reads the group's lists everywhere (shared with links and the group page), plus this place's folders.
  await Promise.all([
    queryClient.prefetchQuery(teamDocsQuery(team.id)),
    queryClient.prefetchQuery(teamDiagramsQuery(team.id)),
    queryClient.prefetchQuery(foldersQuery(team.id, params.workspaceId ?? null)),
  ])
  return null
}

/**
 * …/docs/:docId (team view or inside a workspace): 404 unless the doc is
 * readable (RLS), belongs to this team, and (in a workspace) to that workspace.
 */
export async function docLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  // The editor's code downloads alongside the doc, so the page renders without waiting on it.
  const [memberships, doc] = await Promise.all([
    queryClient.ensureQueryData(myTeamsQuery(user.id)),
    queryClient.ensureQueryData(documentQuery(params.docId ?? '')),
    docView.preload(),
  ])
  const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
  const wrongWorkspace = params.workspaceId !== undefined && doc?.workspace_id !== params.workspaceId
  if (!doc || !team || doc.team_id !== team.id || wrongWorkspace) {
    throw data('Doc not found, or you don’t have access to it.', { status: 404 })
  }
  return null
}
