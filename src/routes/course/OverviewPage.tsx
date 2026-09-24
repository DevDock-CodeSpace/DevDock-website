import { ArrowRight, BookOpen, CalendarClock, Users, Video } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CourseProgress } from '@/features/courses/CourseProgress'
import { formatLessonNumber, formatSessionTime } from '@/features/courses/format'
import { LessonList } from '@/features/courses/LessonList'
import { useCurrentCourse } from '@/features/courses/use-course'

export function OverviewPage() {
  const course = useCurrentCourse()
  const [now] = useState(Date.now)
  const current = course.lessons.find((l) => l.status === 'in-progress')
  const nextSession = course.sessions
    .filter((s) => new Date(s.startsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]
  const students = course.members.filter((m) => m.role === 'student').length

  return (
    <>
      <PageHeader title={course.title} description={course.description}>
        <Badge variant="secondary" className="font-mono">
          {course.code}
        </Badge>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<BookOpen />} label="Lessons" value={course.lessons.length} />
        <Stat icon={<Users />} label="Students" value={students} />
        <Stat
          icon={<CalendarClock />}
          label="Next live class"
          value={nextSession ? formatSessionTime(nextSession.startsAt) : 'None scheduled'}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Up next</CardDescription>
            <CardTitle>
              {current ? (
                <>
                  <span className="mr-2 font-mono text-muted-foreground">
                    {formatLessonNumber(current.number)}
                  </span>
                  {current.title}
                </>
              ) : (
                'All lessons complete'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {current && <p className="text-sm text-muted-foreground">{current.summary}</p>}
            <CourseProgress lessons={course.lessons} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Live class</CardDescription>
            <CardTitle>{nextSession?.title ?? 'Nothing scheduled'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {nextSession && (
              <p className="font-mono text-sm text-muted-foreground">
                {formatSessionTime(nextSession.startsAt)} · {nextSession.durationMinutes}m
              </p>
            )}
            <Link
              to="live"
              className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              <Video className="size-4" /> Go to live class
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Lessons</h2>
        <Link
          to="lessons"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          View all <ArrowRight className="size-4" />
        </Link>
      </div>
      <LessonList lessons={course.lessons.slice(0, 4)} />
    </>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate font-medium">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
