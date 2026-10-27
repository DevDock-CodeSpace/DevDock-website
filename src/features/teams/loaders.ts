import { data, redirect, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { teamPinsQuery, teamViewsQuery } from '@/features/issues/viewsApi'
import { notificationsQuery, unreadCountsQuery } from '@/features/messaging/api'
import { availableCollections, pickCollection, readCollectionView } from '@/features/collections/view'
import { myWorkspaceRolesQuery, teamContentsQuery, teamWorkspacesQuery, workspaceQuery } from '@/features/workspaces/api'
import { readRecentVisits } from '@/features/workspaces/recent'
import { queryClient } from '@/lib/query-client'
import { myTeamsQuery } from './api'
import { lastTeam, rememberTeam } from './last-team'
import { landingPath, startPath } from './landing'

/** /app: send the user to onboarding (no teams) or where their last/first team opens (`teamStartLoader`). */
export async function appIndexLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const memberships = await queryClient.fetchQuery(myTeamsQuery(user.id))
  if (memberships.length === 0) throw redirect('/onboarding')
  const last = lastTeam()
  const target = memberships.find((m) => m.team.slug === last) ?? memberships[0]
  throw redirect(startPath(target.team.slug))
}

/** /onboarding: open to everyone signed in (new users, and existing users adding a team). */
export async function onboardingLoader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  await queryClient.ensureQueryData(myTeamsQuery(user.id))
  return null
}

/**
 * /t/:teamSlug: must be a member; primes workspaces for the sidebar and home page, and starts the rest
 * of the shell's group data (Starred, saved views, unread counts, the bell) in the same round instead
 * of after the sidebar has mounted. Only the workspace list and roles are awaited.
 */
export async function teamLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const memberships = await queryClient.ensureQueryData(myTeamsQuery(user.id))
  const membership = memberships.find((m) => m.team.slug === params.teamSlug)
  if (!membership) throw data('Group not found, or you’re not a member.', { status: 404 })

  rememberTeam(membership.team.slug)
  const team = membership.team.id
  void queryClient.prefetchQuery(teamPinsQuery(team))
  void queryClient.prefetchQuery(teamViewsQuery(team))
  void queryClient.prefetchQuery(unreadCountsQuery(team))
  void queryClient.prefetchQuery(notificationsQuery(team, user.id))
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

/**
 * /t/:teamSlug/start: where a group opens, after signing in or switching group or collection
 * (`landingPath`). It reads the same cached workspace list the sidebar does, so it costs no extra request.
 */
export async function teamStartLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const memberships = await queryClient.ensureQueryData(myTeamsQuery(user.id))
  const membership = memberships.find((m) => m.team.slug === params.teamSlug)
  if (!membership) throw data('Group not found, or you’re not a member.', { status: 404 })
  const { team } = membership
  const { workspaces, collections } = await queryClient.ensureQueryData(teamContentsQuery(team.id))
  const isAdmin = membership.role === 'owner' || membership.role === 'admin'
  const collection = pickCollection(availableCollections(collections, workspaces, user.id, isAdmin), readCollectionView(team.id), user.id)
  throw redirect(landingPath(team.slug, team.type, collection, workspaces, readRecentVisits(team.id)))
}
