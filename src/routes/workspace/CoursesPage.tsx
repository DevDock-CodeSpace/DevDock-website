import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight, GraduationCap, Users } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/features/auth/hooks'
import { myCourseRolesQuery, workspaceCoursesQuery } from '@/features/courses/api'
import { CreateCourseDialog } from '@/features/courses/components/CreateCourseDialog'
import { useCurrentWorkspace } from '@/features/workspaces/hooks'
import { coursePath } from '@/features/workspaces/nav'
import { courseRoleLabel } from '@/features/workspaces/permissions'

/** Workspace home: the courses the user can see. */
export function CoursesPage() {
  const { user } = useAuth()
  const { workspace, can } = useCurrentWorkspace()
  const courses = useSuspenseQuery(workspaceCoursesQuery(workspace.id)).data
  const myRoles = useSuspenseQuery(myCourseRolesQuery(workspace.id, user.id)).data

  return (
    <>
      <PageHeader
        title="Courses"
        description={
          can.canManageCourses
            ? 'Every course in this workspace.'
            : 'Courses you’ve been added to in this workspace.'
        }
      >
        {can.canManageCourses && <CreateCourseDialog />}
      </PageHeader>

      {courses.length === 0 ? (
        <EmptyState canCreate={can.canManageCourses} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => {
            const myRole = myRoles[course.id]
            return (
              <Card key={course.id} className="transition-shadow hover:ring-foreground/25">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {myRole ? (
                      <Badge variant={myRole === 'lead' ? 'default' : 'secondary'}>{courseRoleLabel[myRole]}</Badge>
                    ) : (
                      <Badge variant="outline">Admin access</Badge>
                    )}
                    <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <Users className="size-3" />
                      {course.memberCount}
                    </span>
                  </div>
                  <CardTitle className="pt-2 text-lg">{course.title}</CardTitle>
                  {course.description && (
                    <CardDescription className="line-clamp-2">{course.description}</CardDescription>
                  )}
                </CardHeader>
                <CardFooter>
                  <Link
                    to={coursePath(workspace.slug, course.id)}
                    className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                  >
                    Open course <ArrowRight className="size-4" />
                  </Link>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

function EmptyState({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <GraduationCap className="size-8 text-muted-foreground" />
      <p className="font-medium">No courses yet</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {canCreate
          ? 'Create the first course, then add people from this workspace to it.'
          : 'You haven’t been added to any courses in this workspace. Ask an owner or admin to add you.'}
      </p>
    </div>
  )
}
