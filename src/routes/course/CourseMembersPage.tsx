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
import { useAuth } from '@/features/auth/hooks'
import {
  courseMembersQuery,
  removeCourseMember,
  setCourseRole,
  type CourseMember,
  type CourseRole,
} from '@/features/courses/api'
import { AddCourseMembersDialog } from '@/features/courses/components/AddCourseMembersDialog'
import { PersonRow } from '@/features/workspaces/components/PersonRow'
import { useCurrentCourse, useCurrentWorkspace } from '@/features/workspaces/hooks'
import { workspacePath } from '@/features/workspaces/nav'
import { courseRoleLabel } from '@/features/workspaces/permissions'
import { errorMessage } from '@/lib/errors'

export function CourseMembersPage() {
  const { user } = useAuth()
  const { workspace } = useCurrentWorkspace()
  const { course, can } = useCurrentCourse()
  const members = useSuspenseQuery(courseMembersQuery(course.id)).data
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [removing, setRemoving] = useState<CourseMember | null>(null)

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: courseMembersQuery(course.id).queryKey }),
      queryClient.invalidateQueries({ queryKey: ['courses', 'workspace', workspace.id] }),
    ])

  const changeRole = useMutation({
    mutationFn: (vars: { userId: string; role: CourseRole }) => setCourseRole(course.id, vars.userId, vars.role),
    onSuccess: (_, vars) => {
      toast.success(`Role changed to ${courseRoleLabel[vars.role]}`)
      return refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: (userId: string) => removeCourseMember(course.id, userId),
    onSuccess: async (_, userId) => {
      setRemoving(null)
      if (userId === user.id && !can.canDelete) {
        // Left the course and (not being an admin) can no longer see it.
        toast.success(`You left ${course.title}`)
        await navigate(workspacePath(workspace.slug), { replace: true })
        queryClient.removeQueries({ queryKey: ['courses', course.id] })
        await queryClient.invalidateQueries({ queryKey: ['courses', 'workspace', workspace.id] })
        return
      }
      toast.success('Removed from course')
      await refresh()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <>
      <PageHeader
        title="Members"
        description={`${members.length} ${members.length === 1 ? 'person' : 'people'} in ${course.title}.`}
      >
        {can.canAddMembers && <AddCourseMembersDialog />}
      </PageHeader>

      {members.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nobody has been added to this course yet.
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
                role={courseRoleLabel[member.role]}
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
                            {isYou ? 'Leave course' : 'Remove from course'}
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
        title={removing?.user_id === user.id ? 'Leave this course?' : 'Remove from course?'}
        description={
          removing?.user_id === user.id
            ? `You’ll lose access to ${course.title} unless someone adds you again.`
            : `${removing?.profile?.display_name ?? 'This person'} will lose access to ${course.title}. They stay in the workspace.`
        }
        confirmLabel={removing?.user_id === user.id ? 'Leave' : 'Remove'}
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.user_id)}
      />
    </>
  )
}
