import { PageHeader } from '@/components/PageHeader'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useCurrentCourse } from '@/features/courses/use-course'
import { initials } from '@/lib/utils'

export function MembersPage() {
  const course = useCurrentCourse()

  return (
    <>
      <PageHeader title="Members" description={`${course.members.length} people in this course.`} />
      <ul className="divide-y rounded-lg border bg-card">
        {course.members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 px-4 py-3">
            <Avatar className="size-9 rounded-md">
              <AvatarFallback className="rounded-md text-xs">{initials(member.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{member.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">@{member.handle}</p>
            </div>
            <Badge
              variant={member.role === 'instructor' ? 'default' : 'outline'}
              className="capitalize"
            >
              {member.role}
            </Badge>
          </li>
        ))}
      </ul>
    </>
  )
}
