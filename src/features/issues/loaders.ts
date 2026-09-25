import { data, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { queryClient } from '@/lib/query-client'
import { cyclesQuery, issueQuery } from './api'

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
  if (!cycles.some((c) => c.number === Number(params.cycleNumber))) {
    throw data('Cycle not found.', { status: 404 })
  }
  return null
}
