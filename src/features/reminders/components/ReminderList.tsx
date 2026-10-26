import { useInfiniteQuery } from '@tanstack/react-query'
import { Check, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LoadMore } from '@/components/LoadMore'
import { cn } from '@/lib/utils'
import { remindersPageQuery, type Reminder, type RemindersPage } from '../api'
import { useChangeNoteStatus } from '../hooks'
import { formatReminderDay } from '../when'
import { NoteContext } from './NoteContext'
import { NoteMenu } from './NoteMenu'
import { ReminderDialog } from './ReminderDialog'

type ReminderSectionProps = {
  status: 'completed' | 'cancelled'
  teamId: string
  userId: string
  now: number
  /** A note to scroll to and outline (opened from a notification). */
  highlight: string | null
  /** Load further pages by scrolling (only the panel's last section). */
  auto: boolean
}

/** The finished notes (Done or Archived) in the Notes panel's fold: compact rows, a page at a time. */
export function ReminderSection({ status, teamId, userId, now, highlight, auto }: ReminderSectionProps) {
  const query = useInfiniteQuery(remindersPageQuery(teamId, userId, status))
  if (query.isPending) return <div className="h-16 animate-pulse rounded-md bg-muted/40" aria-label="Loading notes" />
  if (query.isError) return <p className="py-4 text-center text-xs text-muted-foreground">Couldn’t load notes. Reload the page to try again.</p>
  // Rows another section now owns (changed here a moment ago, before the refetch) are left out.
  const rows = rowsOf(query.data.pages).filter((r) => r.status === status)
  if (rows.length === 0) {
    return <p className="py-3 text-center text-xs text-muted-foreground">{status === 'completed' ? 'Nothing done yet.' : 'Nothing archived.'}</p>
  }
  return (
    <>
      <ul className="space-y-px">
        {rows.map((reminder) => (
          <FinishedRow key={reminder.id} reminder={reminder} now={now} highlighted={reminder.id === highlight} />
        ))}
      </ul>
      <LoadMore query={query} auto={auto} />
    </>
  )
}

/** The pages' rows in order. A reminder that moved between pages shows once. */
function rowsOf(pages: RemindersPage[]): Reminder[] {
  const seen = new Set<string>()
  return pages.flatMap((page) => page.rows).filter((row) => !seen.has(row.id) && seen.add(row.id))
}

function FinishedRow({ reminder, now, highlighted }: { reminder: Reminder; now: number; highlighted: boolean }) {
  const change = useChangeNoteStatus()
  const [editing, setEditing] = useState(false)
  const row = useRef<HTMLLIElement>(null)
  const done = reminder.status === 'completed'
  const at = done ? reminder.completed_at : reminder.cancelled_at

  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])

  return (
    <li
      ref={row}
      className={cn('group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50', highlighted && 'bg-brand/5 ring-1 ring-brand/40 ring-inset')}
    >
      <button
        type="button"
        onClick={() => void change(reminder, 'pending', 'Note reopened.')}
        aria-label={`Reopen “${reminder.title}”`}
        title="Reopen"
        className="group/check relative flex size-4 shrink-0 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className={cn('flex size-4 items-center justify-center rounded-full group-hover/check:hidden', done ? 'bg-brand/80 text-brand-foreground' : 'bg-muted text-muted-foreground')}>
          {done ? <Check className="size-2.5" strokeWidth={3} /> : <X className="size-2.5" strokeWidth={3} />}
        </span>
        <RotateCcw className="hidden size-3.5 text-muted-foreground group-hover/check:block" />
      </button>
      <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left focus-visible:outline-none">
        <span className={cn('block truncate text-sm text-muted-foreground', !done && 'line-through')}>{reminder.title}</span>
      </button>
      <NoteContext reminder={reminder} className="hidden max-w-28 sm:flex" />
      {at && <span className="shrink-0 font-mono text-[11px] text-muted-foreground/80">{formatReminderDay(at, now)}</span>}
      <NoteMenu reminder={reminder} onEdit={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" />
      {editing && <ReminderDialog reminder={reminder} open onOpenChange={setEditing} />}
    </li>
  )
}
