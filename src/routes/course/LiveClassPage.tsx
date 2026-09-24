import { Video } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatLessonNumber, formatSessionTime } from '@/features/courses/format'
import type { LiveSession } from '@/features/courses/types'
import { useCurrentCourse } from '@/features/courses/use-course'

export function LiveClassPage() {
  const course = useCurrentCourse()
  const [now] = useState(Date.now)
  const byTime = [...course.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const upcoming = byTime.filter((s) => new Date(s.startsAt).getTime() > now)
  const past = byTime.filter((s) => new Date(s.startsAt).getTime() <= now).reverse()
  const [next, ...later] = upcoming

  return (
    <>
      <PageHeader title="Live Class" description="Scheduled sessions and the live room." />

      <Card>
        <CardHeader>
          <CardDescription>Next session</CardDescription>
          <CardTitle className="text-lg">{next?.title ?? 'Nothing scheduled'}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {next ? (
            <p className="font-mono text-sm text-muted-foreground">
              {formatSessionTime(next.startsAt)} · {next.durationMinutes}m · lesson{' '}
              {formatLessonNumber(next.lessonNumber)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">The instructor hasn't scheduled a session.</p>
          )}
          {/* Jitsi Meet room is wired up in a later phase. */}
          <Button disabled>
            <Video /> Join room
          </Button>
        </CardContent>
      </Card>

      <SessionList title="Later" sessions={later} />
      <SessionList title="Past sessions" sessions={past} muted />
    </>
  )
}

function SessionList({
  title,
  sessions,
  muted = false,
}: {
  title: string
  sessions: LiveSession[]
  muted?: boolean
}) {
  if (sessions.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      <ul className="divide-y rounded-lg border bg-card">
        {sessions.map((session) => (
          <li key={session.id} className="flex items-center gap-4 px-4 py-3">
            <span className="w-6 shrink-0 font-mono text-sm text-muted-foreground">
              {formatLessonNumber(session.lessonNumber)}
            </span>
            <p className="min-w-0 flex-1 truncate font-medium">{session.title}</p>
            <span className="hidden font-mono text-xs text-muted-foreground sm:block">
              {formatSessionTime(session.startsAt)}
            </span>
            {muted && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                Ended
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
