import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight, BookOpen, FolderGit2, Users, Video, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { courseMembersQuery } from '@/features/courses/api'
import { useCurrentCourse, useCurrentWorkspace } from '@/features/workspaces/hooks'
import { coursePath } from '@/features/workspaces/nav'
import { courseRoleLabel } from '@/features/workspaces/permissions'

export function CourseOverviewPage() {
  const { workspace } = useCurrentWorkspace()
  const { course, courseRole } = useCurrentCourse()
  const members = useSuspenseQuery(courseMembersQuery(course.id)).data
  const leads = members.filter((m) => m.role === 'lead')
  const base = coursePath(workspace.slug, course.id)

  return (
    <>
      <PageHeader title={course.title} description={course.description ?? undefined}>
        <Badge variant={courseRole === 'lead' ? 'default' : courseRole ? 'secondary' : 'outline'}>
          {courseRole ? courseRoleLabel[courseRole] : 'Admin access'}
        </Badge>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>People</CardDescription>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {leads.length > 0
                ? `Led by ${leads.map((l) => l.profile?.display_name ?? 'a member').join(', ')}`
                : 'No lead assigned yet.'}
            </p>
            <Link to={`${base}/members`} className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
              View members <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Coming next</CardDescription>
            <CardTitle>Course content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <ComingLink to={`${base}/lessons`} icon={BookOpen} label="Lessons" />
            <ComingLink to={`${base}/live`} icon={Video} label="Live class" />
            <ComingLink to={`${base}/resources`} icon={FolderGit2} label="Resources" />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function ComingLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <Icon className="size-4" />
      {label}
      <span className="ml-auto font-mono text-xs">soon</span>
    </Link>
  )
}
