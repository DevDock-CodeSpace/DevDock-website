import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { coursesQuery } from '@/features/courses/api'
import { CourseProgress } from '@/features/courses/CourseProgress'

export function HomePage() {
  const { data: courses } = useSuspenseQuery(coursesQuery)

  return (
    <>
      <PageHeader title="Workspace" description="Your courses and what's coming up next." />
      <div className="grid gap-4 md:grid-cols-2">
        {courses.map((course) => (
          <Card key={course.id} className="transition-shadow hover:ring-foreground/25">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-mono">
                  {course.code}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">
                  {course.members.length} members
                </span>
              </div>
              <CardTitle className="pt-2 text-lg">{course.title}</CardTitle>
              <CardDescription>{course.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <CourseProgress lessons={course.lessons} />
            </CardContent>
            <CardFooter>
              <Link
                to={`/courses/${course.id}`}
                className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
              >
                Open course <ArrowRight className="size-4" />
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </>
  )
}
