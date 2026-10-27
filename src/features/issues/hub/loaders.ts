import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { teamDocsQuery } from '@/features/docs/api'
import { planQuery, teamPlansQuery } from '@/features/plans/api'
import { myTeamsQuery, teamMembersQuery } from '@/features/teams/api'
import { queryClient } from '@/lib/query-client'
import { workspaceMembersQuery, teamWorkspacesQuery } from '@/features/workspaces/api'
import { importPeopleQuery } from '../import/api'
import { projectsCyclesQuery, teamIssuesQuery } from '../api'
import { teamViewsQuery } from '../viewsApi'

async function teamId(request: Request, slug: string | undefined) {
  const user = await requireUser(request)
  const memberships = await queryClient.ensureQueryData(myTeamsQuery(user.id))
  return memberships.find((m) => m.team.slug === slug)?.team.id ?? null
}

/**
 * /t/:teamSlug/issues/*: the hub's lists, side by side: the group's issues (every project the caller
 * can see), its plans, and its people (plan leads). Each tab reads them from the cache. teamLoader
 * 404s a wrong group.
 */
export async function issuesHubLoader({ request, params }: LoaderFunctionArgs) {
  const team = await teamId(request, params.teamSlug)
  if (!team) return null
  await Promise.all([
    queryClient.prefetchQuery(teamIssuesQuery(team)),
    queryClient.prefetchQuery(teamPlansQuery(team)),
    queryClient.prefetchQuery(teamMembersQuery(team)),
  ])
  return null
}

/** …/issues/plans/:planId: 404 unless the plan is in this group (RLS hides other groups' plans). */
export async function planLoader({ request, params }: LoaderFunctionArgs) {
  const team = await teamId(request, params.teamSlug)
  // The plan (with its Brief's text) and the group's files (its folder's docs and whiteboards), side by side.
  const [plan] = await Promise.all([
    queryClient.ensureQueryData(planQuery(params.planId ?? '')),
    team ? queryClient.prefetchQuery(teamDocsQuery(team)) : null,
    team ? queryClient.prefetchQuery(teamDiagramsQuery(team)) : null,
  ])
  if (!plan || plan.team_id !== team) throw data('Plan not found.', { status: 404 })
  return null
}

/** The group's projects that use Issues (all of them, not just the collection view: one cache key). */
export async function issueProjectIds(teamId: string) {
  // The cache holds the group's contents (the query's select picks the workspaces out of them).
  const { workspaces } = await queryClient.ensureQueryData(teamWorkspacesQuery(teamId))
  return workspaces.filter((w) => w.modules.includes('issues')).map((w) => w.id)
}

/** …/issues/sprints: every project's sprints, alongside the page's chunk. */
export async function hubSprintsLoader({ request, params }: LoaderFunctionArgs) {
  const team = await teamId(request, params.teamSlug)
  if (team) await queryClient.prefetchQuery(projectsCyclesQuery(await issueProjectIds(team)))
  return null
}

/** …/issues/views: the group's saved views, alongside the page's chunk. */
export async function hubViewsLoader({ request, params }: LoaderFunctionArgs) {
  const team = await teamId(request, params.teamSlug)
  if (team) await queryClient.prefetchQuery(teamViewsQuery(team))
  return null
}

/** …/issues/settings: each project's imported people and its people, side by side with the chunk. */
export async function hubSettingsLoader({ request, params }: LoaderFunctionArgs) {
  const team = await teamId(request, params.teamSlug)
  if (!team) return null
  const ids = await issueProjectIds(team)
  await Promise.all(ids.flatMap((id) => [queryClient.prefetchQuery(importPeopleQuery(id)), queryClient.prefetchQuery(workspaceMembersQuery(id))]))
  return null
}
