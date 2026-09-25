import { CalendarCheck, Video } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { DocScope } from '@/features/docs/components/DocScope'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LiveSession } from '../api'
import { formatDay, formatTimeRange, sessionStatus, splitSessions } from '../time'

type LiveSessionListProps = {
  sessions: LiveSession[]
  now: number
  href: (session: LiveSession) => string
  /** Group view: show which workspace (or the whole group) each session is for. */
  showScope?: boolean
  empty: ReactNode
}

/** "Upcoming" (live ones on top) and "Past" sections of dense session rows. */
export function LiveSessionList({ sessions, now, href, showScope = false, empty }: LiveSessionListProps) {
  const { current, past } = splitSessions(sessions, now)

  if (sessions.length === 0) {
    return <div className="border-y py-10 text-center text-sm text-muted-foreground">{empty}</div>
  }

  return (
    <div className="space-y-8">
      <Section title="Upcoming" count={current.length}>
        {current.length === 0 ? (
          <div className="border-y py-8 text-center text-sm text-muted-foreground">Nothing scheduled.</div>
        ) : (
          <Rows sessions={current} now={now} href={href} showScope={showScope} />
        )}
      </Section>
      {past.length > 0 && (
        <Section title="Past" count={past.length}>
          <Rows sessions={past.slice(0, 30)} now={now} href={href} showScope={showScope} />
        </Section>
      )}
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="font-mono text-xs text-muted-foreground">{count}</span>
      </div>
      {children}
    </section>
  )
}

function Rows({
  sessions,
  now,
  href,
  showScope,
}: {
  sessions: LiveSession[]
  now: number
  href: (session: LiveSession) => string
  showScope: boolean
}) {
  return (
    <ul className="divide-y border-y">
      {sessions.map((session) => {
        const status = sessionStatus(session, now)
        return (
          <li key={session.id}>
            <Link
              to={href(session)}
              className="flex items-center gap-4 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
            >
              <span className="w-28 shrink-0 font-mono text-xs leading-tight sm:w-36">
                <span className={cn('block', status === 'ended' ? 'text-muted-foreground' : 'text-foreground')}>
                  {formatDay(session.starts_at)}
                </span>
                <span className="block text-muted-foreground">{formatTimeRange(session)}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    'flex min-w-0 items-center gap-2 text-sm font-medium',
                    status === 'ended' && 'text-muted-foreground',
                  )}
                >
                  <Video className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{session.title}</span>
                </span>
                {showScope && (
                  <span className="pl-6">
                    <DocScope doc={session} />
                  </span>
                )}
              </span>
              <StatusLabel status={status} startsAt={session.starts_at} now={now} />
              {session.calendar_event_id ? (
                <CalendarCheck className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-label="In Google Calendar" />
              ) : (
                <span className="hidden size-4 shrink-0 sm:block" />
              )}
              {session.author && <PersonAvatar profile={session.author} className="hidden size-5 md:flex" />}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function StatusLabel({ status, startsAt, now }: { status: ReturnType<typeof sessionStatus>; startsAt: string; now: number }) {
  if (status === 'live') {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        Live now
      </span>
    )
  }
  return (
    <span className="hidden w-24 shrink-0 text-right font-mono text-[11px] text-muted-foreground sm:inline">
      {status === 'ended' ? 'Ended' : timeAgo(startsAt, now)}
    </span>
  )
}
