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
import { PersonRow } from '@/components/PersonRow'
import { removeTeamMember, setTeamRole, teamMembersQuery, type TeamMember } from '@/features/teams/api'
import { InvitesPanel } from '@/features/teams/components/InvitesPanel'
import { RoleGuide } from '@/features/teams/components/RoleGuide'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamRoleLabel } from '@/features/teams/permissions'
import { errorMessage } from '@/lib/errors'

const joinedFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function TeamMembersPage() {
  const { user } = useAuth()
  const { team, role, can } = useCurrentTeam()
  const members = useSuspenseQuery(teamMembersQuery(team.id)).data
  const queryClient = useQueryClient()
  const [removing, setRemoving] = useState<TeamMember | null>(null)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: teamMembersQuery(team.id).queryKey }),
      // Removing someone also removes their workspace memberships.
      queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
    ])

  const changeRole = useMutation({
    mutationFn: (vars: { userId: string; role: 'admin' | 'member' }) =>
      setTeamRole(team.id, vars.userId, vars.role),
    onSuccess: (_, vars) => {
      toast.success(`Role changed to ${teamRoleLabel[vars.role]}`)
      return refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => removeTeamMember(team.id, userId),
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
        title="Group members"
        description={`${members.length} ${members.length === 1 ? 'person' : 'people'} in ${team.name}. Access to each course, project or space is assigned separately.`}
      />

      <ul className="-mt-6 divide-y border-b">
        {members.map((member) => {
          const isYou = member.user_id === user.id
          const canChangeRole = can.canChangeRoles && !isYou && member.role !== 'owner'
          const canRemove = !isYou && can.canRemove(member.role)
          return (
            <PersonRow
              key={member.user_id}
              profile={member.profile}
              isYou={isYou}
              role={teamRoleLabel[member.role]}
              highlight={member.role === 'owner'}
              meta={`joined ${joinedFormat.format(new Date(member.joined_at))}`}
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
                          Remove from group
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

      <RoleGuide type={team.type} myRole={role} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove member?"
        description={
          <>
            {removing?.profile?.display_name ?? 'This person'} will lose access to {team.name} and every workspace in
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
