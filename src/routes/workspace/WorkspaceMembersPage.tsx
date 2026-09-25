import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PersonRow } from '@/components/PersonRow'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { teamPath } from '@/features/teams/nav'
import { workspaceRoleLabel } from '@/features/teams/permissions'
import {
  removeWorkspaceMember,
  setWorkspaceRole,
  workspaceMembersQuery,
  type WorkspaceMember,
  type WorkspaceRole,
} from '@/features/workspaces/api'
import { AddWorkspaceMembersDialog } from '@/features/workspaces/components/AddWorkspaceMembersDialog'
import { errorMessage } from '@/lib/errors'

export function WorkspaceMembersPage() {
  const { user } = useAuth()
  const { team } = useCurrentTeam()
  const { workspace, can } = useCurrentWorkspace()
  const members = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceMembersQuery(workspace.id).queryKey }),
      queryClient.invalidateQueries({ queryKey: ['workspaces', 'team', team.id] }),
    ])

  const changeRole = useMutation({
    mutationFn: (vars: { userId: string; role: WorkspaceRole }) => setWorkspaceRole(workspace.id, vars.userId, vars.role),
    onSuccess: (_, vars) => {
      toast.success(`Role changed to ${workspaceRoleLabel[vars.role]}`)
      return refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(workspace.id, userId),
    onSuccess: async (_, userId) => {
      setRemoving(null)
      if (userId === user.id && !can.canDelete) {
        // Left the workspace and (not being a team admin) can no longer see it.
        toast.success(`You left ${workspace.title}`)
        await navigate(teamPath(team.slug), { replace: true })
        queryClient.removeQueries({ queryKey: ['workspaces', workspace.id] })
        await queryClient.invalidateQueries({ queryKey: ['workspaces', 'team', team.id] })
        return
      }
      toast.success('Removed from workspace')
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <>
      <PageHeader
        title="Members"
        description={`${members.length} ${members.length === 1 ? 'person' : 'people'} in ${workspace.title}.`}
      >
        {can.canAddMembers && <AddWorkspaceMembersDialog />}
      </PageHeader>

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nobody has been added to this workspace yet.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {members.map((member) => {
            const isYou = member.user_id === user.id
            const canChangeRole = can.canAssignLeads
            const canRemove = !isYou && can.canRemove(member.role)
            const canLeave = isYou
            return (
              <PersonRow
                key={member.user_id}
                profile={member.profile}
                isYou={isYou}
                role={workspaceRoleLabel[member.role]}
                highlight={member.role === 'lead'}
                actions={
                  (canChangeRole || canRemove || canLeave) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.profile?.display_name ?? 'member'}`}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canChangeRole && (
                          <DropdownMenuItem
                            onSelect={() =>
                              changeRole.mutate({
                                userId: member.user_id,
                                role: member.role === 'lead' ? 'member' : 'lead',
                              })
                            }
                          >
                            {member.role === 'lead' ? 'Make member' : 'Make lead'}
                          </DropdownMenuItem>
                        )}
                        {canChangeRole && (canRemove || canLeave) && <DropdownMenuSeparator />}
                        {(canRemove || canLeave) && (
                          <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(member)}>
                            {isYou ? 'Leave workspace' : 'Remove from workspace'}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                }
              />
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={removing?.user_id === user.id ? 'Leave this workspace?' : 'Remove from workspace?'}
        description={
          removing?.user_id === user.id
            ? `You’ll lose access to ${workspace.title} unless someone adds you again.`
            : `${removing?.profile?.display_name ?? 'This person'} will lose access to ${workspace.title}. They stay in the team.`
        }
        confirmLabel={removing?.user_id === user.id ? 'Leave' : 'Remove'}
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.user_id)}
      />
    </>
  )
}
