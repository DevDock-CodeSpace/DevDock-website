import { useInfiniteQuery } from '@tanstack/react-query'
import { CalendarCheck, LoaderCircle, Repeat, Video } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { DocScope } from '@/features/docs/components/DocScope'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { meetingsPageQuery, type LiveSession, type MeetingsScope } from '../api'
import { formatDay, formatTimeRange, sessionStatus } from '../time'

type LiveSessionListProps = {
  scope: MeetingsScope
  now: number
  href: (session: LiveSession) => string
  /** Group view: show which workspace (or the whole group) each session is for. */
  showScope?: boolean
  empty: ReactNode
}

/**
 * "Upcoming" (live ones on top) and "Past" sections of dense session rows, fetched
 * MEETINGS_PAGE at a time: the next page loads as the end of a section scrolls into
 * view. The two sections are fetched side by side.
 */
export function LiveSessionList({ scope, now, href, showScope = false, empty }: LiveSessionListProps) {
  const upcoming = useInfiniteQuery(meetingsPageQuery(scope, 'upcoming'))
  const past = useInfiniteQuery(meetingsPageQuery(scope, 'past'))

  if (upcoming.isPending || past.isPending) {
    return <div className="h-40 animate-pulse rounded-md bg-muted/40" aria-label="Loading meetings" />
  }
  if (upcoming.isError || past.isError) {
    return <div className="border-y py-10 text-center text-sm text-muted-foreground">Couldn’t load meetings. Reload the page to try again.</div>
  }
  const upcomingTotal = upcoming.data.pages[0]?.total ?? 0
  const pastTotal = past.data.pages[0]?.total ?? 0
  if (upcomingTotal === 0 && pastTotal === 0) {
    return <div className="border-y py-10 text-center text-sm text-muted-foreground">{empty}</div>
  }

  return (
    <div className="space-y-8">
      <Section title="Upcoming" count={upcomingTotal}>
        {upcomingTotal === 0 ? (
          <div className="border-y py-8 text-center text-sm text-muted-foreground">Nothing scheduled.</div>
        ) : (
          <>
            <Rows sessions={rowsOf(upcoming.data.pages)} now={now} href={href} showScope={showScope} />
            {/* Its end is on screen above Past from the start, so it only loads more when asked. */}
            <LoadMore query={upcoming} auto={pastTotal === 0} />
          </>
        )}
      </Section>
      {pastTotal > 0 && (
        <Section title="Past" count={pastTotal}>
          <Rows sessions={rowsOf(past.data.pages)} now={now} href={href} showScope={showScope} />
          <LoadMore query={past} auto />
        </Section>
      )}
    </div>
  )
}

/** The pages' rows in order. A meeting that moved between pages (time passed, one was added) shows once. */
function rowsOf(pages: { rows: LiveSession[] }[]): LiveSession[] {
  const seen = new Set<string>()
  return pages.flatMap((page) => page.rows).filter((row) => !seen.has(row.id) && seen.add(row.id))
}

/**
 * The section's next page: on click, and with `auto` when the reader scrolls down to it. Only
 * the page's last section is `auto`: a section above it has its end on screen from the
 * start, which isn't the reader asking for more.
 */
function LoadMore({
  query,
  auto,
}: {
  query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => Promise<unknown> }
  auto: boolean
}) {
  const marker = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    const el = marker.current
    if (!auto || !el || !hasNextPage || isFetchingNextPage) return
    // Only when the reader scrolls down to it: an end that's on screen without scrolling
    // (a short list on a tall window) waits for "Show more" instead of loading by itself.
    let near = false
    let scrolled = false
    const load = () => near && scrolled && void fetchNextPage()
    // Start a little before the end is visible, so scrolling rarely waits.
    const observer = new IntersectionObserver(
      (entries) => {
        near = entries.some((e) => e.isIntersecting)
        load()
      },
      { rootMargin: '200px 0px' },
    )
    const onScroll = () => {
      scrolled = true
      load()
    }
    observer.observe(el)
    // Capture: the page area may be its own scroll container.
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [auto, hasNextPage, isFetchingNextPage, fetchNextPage])

  if (!hasNextPage) return null
  return (
    <div ref={marker} className="flex justify-center py-3">
      <button
        type="button"
        onClick={() => void fetchNextPage()}
        disabled={isFetchingNextPage}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {isFetchingNextPage && <LoaderCircle className="size-3.5 animate-spin" />}
        {isFetchingNextPage ? 'Loading…' : 'Show more'}
      </button>
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
                  {session.series_id && <Repeat className="size-3 shrink-0 text-muted-foreground" aria-label="Repeating meeting" />}
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
