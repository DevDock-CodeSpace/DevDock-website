import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '@/features/auth/hooks'
import { myWorkspaceRolesQuery, workspaceQuery } from '@/features/workspaces/api'
import { myTeamsQuery } from './api'
import { teamPath } from './nav'
import { teamPermissions, workspacePermissions } from './permissions'

/** All of the user's team memberships (for the switcher). */
export function useMyTeams() {
  const { user } = useAuth()
  return useSuspenseQuery(myTeamsQuery(user.id)).data
}

/** The team in the URL, the user's role in it, and what that role allows. */
export function useCurrentTeam() {
  const { teamSlug } = useParams()
  const membership = useMyTeams().find((m) => m.team.slug === teamSlug)
  if (!membership) throw new Error('useCurrentTeam must be used under /t/:teamSlug')
  return { team: membership.team, role: membership.role, can: teamPermissions(membership.role) }
}

/** The workspace in the URL, the user's role in it (if any), and what they may do. */
export function useCurrentWorkspace() {
  const { workspaceId } = useParams()
  const { user } = useAuth()
  const { team, role: teamRole } = useCurrentTeam()
  const workspace = useSuspenseQuery(workspaceQuery(workspaceId ?? '')).data
  const myRoles = useSuspenseQuery(myWorkspaceRolesQuery(team.id, user.id)).data
  if (!workspace) throw new Error('useCurrentWorkspace must be used under a loaded workspace route')
  const workspaceRole = myRoles[workspace.id]
  return { workspace, workspaceRole, can: workspacePermissions(teamRole, workspaceRole) }
}

/**
 * After leaving or deleting a team: go somewhere valid *first*, then refresh.
 * Refreshing first would crash the current page (its team vanishes);
 * navigating to /app first could bounce back via the stale cache.
 */
export function useExitTeam() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return async (teamId: string) => {
    const cached = queryClient.getQueryData(myTeamsQuery(user.id).queryKey) ?? []
    const next = cached.find((m) => m.team.id !== teamId)
    await navigate(next ? teamPath(next.team.slug) : '/onboarding', { replace: true })
    queryClient.removeQueries({ queryKey: ['workspaces', 'team', teamId] })
    await queryClient.invalidateQueries({ queryKey: ['teams'] })
  }
}
