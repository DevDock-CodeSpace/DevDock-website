import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Check, LoaderCircle, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { addCourseMember, courseMembersQuery, type CourseRole } from '@/features/courses/api'
import { workspaceMembersQuery } from '@/features/workspaces/api'
import { useCurrentCourse, useCurrentWorkspace } from '@/features/workspaces/hooks'
import { errorMessage } from '@/lib/errors'
import { initials } from '@/lib/utils'

/** Add people who are already in the workspace to this course. */
export function AddCourseMembersDialog() {
  const { workspace } = useCurrentWorkspace()
  const { course, can } = useCurrentCourse()
  const queryClient = useQueryClient()
  const workspaceMembers = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const courseMembers = useSuspenseQuery(courseMembersQuery(course.id)).data
  const [role, setRole] = useState<CourseRole>('member')
  const inCourse = new Set(courseMembers.map((m) => m.user_id))
  const candidates = workspaceMembers.filter((m) => !inCourse.has(m.user_id))

  const add = useMutation({
    mutationFn: (userId: string) => addCourseMember(course.id, userId, role),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: courseMembersQuery(course.id).queryKey }),
        queryClient.invalidateQueries({ queryKey: ['courses', 'workspace', workspace.id] }),
      ]),
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add people
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add people to {course.title}</DialogTitle>
          <DialogDescription>
            Only members of {workspace.name} can be added. To bring in someone new, share a workspace invite code first.
          </DialogDescription>
        </DialogHeader>

        {can.canAssignLeads && (
          <div className="flex items-center gap-3">
            <Label className="shrink-0">Add as</Label>
            <Select value={role} onValueChange={(v) => setRole(v as CourseRole)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="lead">Lead</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Everyone in this workspace is already in the course.</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
            {candidates.map((person) => {
              const name = person.profile?.display_name ?? 'Unnamed member'
              const adding = add.isPending && add.variables === person.user_id
              return (
                <li key={person.user_id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar className="size-8 rounded-md">
                    {person.profile?.avatar_url && (
                      <AvatarImage src={person.profile.avatar_url} alt="" referrerPolicy="no-referrer" />
                    )}
                    <AvatarFallback className="rounded-md text-xs">{initials(name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <Button size="sm" variant="outline" disabled={add.isPending} onClick={() => add.mutate(person.user_id)}>
                    {adding ? <LoaderCircle className="animate-spin" /> : <Check />} Add
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
