import { useSuspenseQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { myWorkspaceRolesQuery } from '@/features/workspaces/api'

/**
 * Who may delete docs, move them and manage folders in a scope. Mirrors
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

/**
 * Who may create a doc and edit its title/body in a scope: everyone who can
 * read docs there. Mirrors private.can_edit_document() (UI only).
 *   team-wide (null): any team member
 *   workspace:        team owner/admin, or anyone in that workspace
 * Deleting docs, moving them and managing folders stay with useCanWriteDocs.
 */
export function useCanEditDocs() {
  const { user } = useAuth()
  const { team, can } = useCurrentTeam()
  const myRoles = useSuspenseQuery(myWorkspaceRolesQuery(team.id, user.id)).data
  return (workspaceId: string | null) => can.isAdmin || workspaceId === null || myRoles[workspaceId] !== undefined
}
