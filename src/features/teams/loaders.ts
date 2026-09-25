import { data, redirect, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { myWorkspaceRolesQuery, teamWorkspacesQuery, workspaceQuery } from '@/features/workspaces/api'
import { queryClient } from '@/lib/query-client'
import { myTeamsQuery } from './api'
import { lastTeam, rememberTeam } from './last-team'
import { teamPath } from './nav'

/** /app: send the user to onboarding (no teams) or their last/first team. */
export async function appIndexLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const memberships = await queryClient.fetchQuery(myTeamsQuery(user.id))
  if (memberships.length === 0) throw redirect('/onboarding')
  const last = lastTeam()
  const target = memberships.find((m) => m.team.slug === last) ?? memberships[0]
  throw redirect(teamPath(target.team.slug))
}

/** /onboarding: open to everyone signed in (new users, and existing users adding a team). */
export async function onboardingLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  await queryClient.ensureQueryData(myTeamsQuery(user.id))
  return null
}

/** /t/:teamSlug: must be a member; primes workspaces for the sidebar and home page. */
export async function teamLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const memberships = await queryClient.ensureQueryData(myTeamsQuery(user.id))
  const membership = memberships.find((m) => m.team.slug === params.teamSlug)
  if (!membership) throw data('Group not found, or you’re not a member.', { status: 404 })

  rememberTeam(membership.team.slug)
  await Promise.all([
    queryClient.ensureQueryData(teamWorkspacesQuery(membership.team.id)),
    queryClient.ensureQueryData(myWorkspaceRolesQuery(membership.team.id, user.id)),
  ])
  return null
}

/** /t/:teamSlug/w/:workspaceId: visible to team owners/admins and workspace members (RLS). */
export async function workspaceLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const [memberships, workspace] = await Promise.all([
    queryClient.ensureQueryData(myTeamsQuery(user.id)),
    queryClient.ensureQueryData(workspaceQuery(params.workspaceId ?? '')),
  ])
  const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
  if (!workspace || !team || workspace.team_id !== team.id) {
    throw data('Workspace not found, or you don’t have access to it.', { status: 404 })
  }
  return null
}
