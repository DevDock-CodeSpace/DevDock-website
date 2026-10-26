import { useQuery } from '@tanstack/react-query'
import { CalendarDays, List } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { cn } from '@/lib/utils'
import { useCollectionView } from '@/features/collections/hooks'
import { meetingsRangeQuery, type LiveSession, type MeetingsScope } from '../api'
import { readCursor, visibleRange, type CalendarMode } from '../calendarView'
import { useCanWriteLive } from '../hooks'
import { toDateKey } from '../recurrence'
import { LiveSessionList } from './LiveSessionList'
import { ScheduleSessionDialog } from './ScheduleSessionDialog'

// The calendar is only needed when someone switches to it.
const MeetingCalendar = lazy(() => import('./MeetingCalendar').then((m) => ({ default: m.MeetingCalendar })))

type MeetingsViewProps = {
  /** Whose meetings: the list pages through them, the calendar asks for its visible range. */
  scope: MeetingsScope
  now: number
  href: (session: LiveSession) => string
  /** Group view: show which workspace (or the whole group) each meeting is for. */
  showScope?: boolean
  /** Fixes the scope to this workspace (inside a workspace's Meetings tab). */
  workspaceId?: string
  empty: ReactNode
  /** Shown at the left of the toolbar. */
  lead?: ReactNode
}

/**
 * The Meetings page body: a List / Calendar switch (kept in the URL as
 * ?view=list|calendar&mode=week&date=YYYY-MM-DD; calendar month by default, list on phones) and, for people who may schedule
 * here, a "New meeting" button plus click-to-create on the calendar.
 */
export function MeetingsView({ scope, now, href, showScope, workspaceId, empty, lead }: MeetingsViewProps) {
  // Only the collection being looked at (everything, in a group without collections).
  const { workspaces } = useCollectionView()
  const canWrite = useCanWriteLive()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState<Date | null>(null)

  // Opens on the calendar's month (owner's choice); a phone is too narrow for seven columns, so
  // there the list comes first. Either way the choice is in the URL.
  const [narrow] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  const view = (params.get('view') ?? (narrow ? 'list' : 'calendar')) === 'list' ? 'list' : 'calendar'
  const mode: CalendarMode = params.get('mode') === 'week' ? 'week' : 'month'
  const cursor = readCursor(params.get('date'), now)
  const range = visibleRange(cursor, mode)
  // Only while the calendar is showing; the list fetches its own pages.
  const calendar = useQuery({ ...meetingsRangeQuery(scope, range.from, range.to), enabled: view === 'calendar' })

  const canSchedule = workspaceId
    ? canWrite(workspaceId)
    : canWrite(null) || workspaces.some((w) => canWrite(w.id))

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">{lead}</div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="View" className="flex rounded-md border p-0.5">
            {(
              [
                ['list', 'List', List],
                ['calendar', 'Calendar', CalendarDays],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => update({ view: value })}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  view === value ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
          <ScheduleSessionDialog workspaceId={workspaceId} />
        </div>
      </div>

      {view === 'calendar' ? (
        <Suspense fallback={<div className="h-96 animate-pulse rounded-md bg-muted/40" />}>
        <MeetingCalendar
          sessions={calendar.data ?? []}
          now={now}
          cursor={cursor}
          mode={mode}
          href={href}
          onNavigate={(next) =>
            update({
              ...(next.date ? { date: toDateKey(next.date) } : {}),
              ...(next.mode ? { mode: next.mode === 'month' ? null : next.mode } : {}),
            })
          }
          onCreate={canSchedule ? setCreating : undefined}
        />
        </Suspense>
      ) : (
        <LiveSessionList scope={scope} now={now} href={href} showScope={showScope} empty={empty} />
      )}

      {creating && (
        <ScheduleSessionDialog
          key={creating.getTime()}
          open
          onOpenChange={(open) => !open && setCreating(null)}
          workspaceId={workspaceId}
          defaultStart={creating}
        />
      )}
    </div>
  )
}
