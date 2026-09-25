import { useSuspenseQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { myWorkspaceRolesQuery } from '@/features/workspaces/api'

/**
 * Who may create/edit/delete a doc in a scope. Mirrors
 * private.can_write_document() for showing UI only; RLS re-checks every write.
 *   team-wide (null): team owner/admin
 *   workspace:        team owner/admin, or that workspace's lead
 */
export function useCanWriteDocs() {
  const { user } = useAuth()
  const { team, can } = useCurrentTeam()
  const myRoles = useSuspenseQuery(myWorkspaceRolesQuery(team.id, user.id)).data
  return (workspaceId: string | null) =>
    can.isAdmin || (workspaceId !== null && myRoles[workspaceId] === 'lead')
}
