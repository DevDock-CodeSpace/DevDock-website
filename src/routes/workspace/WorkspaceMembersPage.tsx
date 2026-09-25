import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
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
import { useAuth } from '@/features/auth/hooks'
import {
  removeWorkspaceMember,
  setWorkspaceRole,
  workspaceMembersQuery,
  type WorkspaceMember,
} from '@/features/workspaces/api'
import { InvitesPanel } from '@/features/workspaces/components/InvitesPanel'
import { PersonRow } from '@/features/workspaces/components/PersonRow'
import { useCurrentWorkspace } from '@/features/workspaces/hooks'
import { workspaceRoleLabel } from '@/features/workspaces/permissions'
import { errorMessage } from '@/lib/errors'

const joinedFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function WorkspaceMembersPage() {
  const { user } = useAuth()
  const { workspace, can } = useCurrentWorkspace()
  const members = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState<WorkspaceMember | null>(null)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceMembersQuery(workspace.id).queryKey }),
      // Removing someone also removes their course memberships.
      queryClient.invalidateQueries({ queryKey: ['courses'] }),
    ])

  const changeRole = useMutation({
    mutationFn: (vars: { userId: string; role: 'admin' | 'member' }) =>
      setWorkspaceRole(workspace.id, vars.userId, vars.role),
    onSuccess: (_, vars) => {
      toast.success(`Role changed to ${workspaceRoleLabel[vars.role]}`)
      return refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(workspace.id, userId),
    onSuccess: () => {
      toast.success('Member removed')
      setRemoving(null)
      return refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <>
      <PageHeader
        title="Members"
        description={`${members.length} ${members.length === 1 ? 'person' : 'people'} in ${workspace.name}. Course access is assigned per course.`}
      />

      <ul className="divide-y rounded-lg border bg-card">
        {members.map((member) => {
          const isYou = member.user_id === user.id
          const canChangeRole = can.canChangeRoles && !isYou && member.role !== 'owner'
          const canRemove = !isYou && can.canRemove(member.role)
          return (
            <PersonRow
              key={member.user_id}
              profile={member.profile}
              isYou={isYou}
              role={workspaceRoleLabel[member.role]}
              highlight={member.role === 'owner'}
              meta={`Joined ${joinedFormat.format(new Date(member.joined_at))}`}
              actions={
                (canChangeRole || canRemove) && (
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
                              role: member.role === 'admin' ? 'member' : 'admin',
                            })
                          }
                        >
                          {member.role === 'admin' ? 'Make member' : 'Make admin'}
                        </DropdownMenuItem>
                      )}
                      {canChangeRole && canRemove && <DropdownMenuSeparator />}
                      {canRemove && (
                        <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(member)}>
                          Remove from workspace
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

      {can.canInvite && <InvitesPanel />}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove member?"
        description={
          <>
            {removing?.profile?.display_name ?? 'This person'} will lose access to {workspace.name} and every course in
            it. You can invite them again later.
          </>
        }
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.user_id)}
      />
    </>
  )
}
