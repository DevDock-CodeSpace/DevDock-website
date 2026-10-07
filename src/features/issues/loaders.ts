import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { queryClient } from '@/lib/query-client'
import { workspaceReposQuery } from '@/features/repos/api'
import { workspaceMembersQuery, workspaceQuery } from '@/features/workspaces/api'
import { cyclesQuery, issueQuery, labelsQuery, workspaceIssuesQuery } from './api'
import { workspaceViewsQuery } from './viewsApi'

/**
 * …/w/:workspaceId/issues/:issueNumber: 404 unless the number is valid and the
 * issue exists in this workspace (RLS hides other workspaces' issues).
 * workspaceLoader has already checked the workspace itself.
 */
export async function issueLoader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request)
  const number = Number(params.issueNumber)
  if (!Number.isInteger(number) || number < 1) throw data('Issue not found.', { status: 404 })
  const issue = await queryClient.ensureQueryData(issueQuery(params.workspaceId ?? '', number))
  if (!issue) throw data('Issue not found, or you don’t have access to it.', { status: 404 })
  return null
}

/** …/w/:workspaceId/issues/cycles/:cycleNumber: 404 unless that cycle exists in this workspace. */
export async function cycleLoader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request)
  const cycles = await queryClient.ensureQueryData(cyclesQuery(params.workspaceId ?? ''))
  // "current" is the pinnable address of whichever cycle is running (the page says so if none is).
  if (params.cycleNumber !== 'current' && !cycles.some((c) => c.number === Number(params.cycleNumber))) {
    throw data('Sprint not found.', { status: 404 })
  }
  return null
}

/**
 * …/w/:workspaceId/issues/*: starts everything the Issues pages need at once, so the page doesn't discover
 * its data one request at a time. All of these are independent, so they run in parallel with each other
 * (and with the child route's own loader). A single issue's page doesn't need the whole list, so it's skipped there.
 * Failures are left to the page, which shows them where they belong.
 */
export async function issuesLoader({ request, params }: LoaderFunctionArgs) {
  await requireUser(request)
  const workspaceId = params.workspaceId ?? ''
  const workspace = await queryClient.ensureQueryData(workspaceQuery(workspaceId))
  if (!workspace?.modules.includes('issues')) return null
  const onIssuePage = /\/issues\/\d+\/?$/.test(new URL(request.url).pathname)
  await Promise.all([
    queryClient.prefetchQuery(workspaceMembersQuery(workspaceId)),
    queryClient.prefetchQuery(labelsQuery(workspaceId)),
    queryClient.prefetchQuery(cyclesQuery(workspaceId)),
    queryClient.prefetchQuery(workspaceReposQuery(workspaceId)),
    queryClient.prefetchQuery(workspaceViewsQuery(workspaceId)),
    ...(onIssuePage ? [] : [queryClient.prefetchQuery(workspaceIssuesQuery(workspaceId))]),
  ])
  return null
}
