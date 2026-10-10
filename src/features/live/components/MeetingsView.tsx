import { CalendarDays, List } from 'lucide-react'
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { cn } from '@/lib/utils'
import { useCollectionView } from '@/features/collections/hooks'
import type { LiveSession } from '../api'
import { readCursor, type CalendarMode } from '../calendarView'
import { useCanWriteLive } from '../hooks'
import { toDateKey } from '../recurrence'
import { LiveSessionList } from './LiveSessionList'
import { ScheduleSessionDialog } from './ScheduleSessionDialog'

// The calendar is only needed when someone switches to it.
const MeetingCalendar = lazy(() => import('./MeetingCalendar').then((m) => ({ default: m.MeetingCalendar })))

type MeetingsViewProps = {
  sessions: LiveSession[]
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
 * ?view=calendar&mode=week&date=YYYY-MM-DD) and, for people who may schedule
 * here, a "New meeting" button plus click-to-create on the calendar.
 */
export function MeetingsView({ sessions, now, href, showScope, workspaceId, empty, lead }: MeetingsViewProps) {
  // Only the collection being looked at (everything, in a group without collections).
  const { workspaces } = useCollectionView()
  const canWrite = useCanWriteLive()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState<Date | null>(null)

  const view = params.get('view') === 'calendar' ? 'calendar' : 'list'
  const mode: CalendarMode = params.get('mode') === 'week' ? 'week' : 'month'
  const cursor = readCursor(params.get('date'), now)

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
                onClick={() => update({ view: value === 'list' ? null : value })}
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
          sessions={sessions}
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
        <LiveSessionList sessions={sessions} now={now} href={href} showScope={showScope} empty={empty} />
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
