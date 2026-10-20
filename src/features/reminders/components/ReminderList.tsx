import { useInfiniteQuery } from '@tanstack/react-query'
import { Check, Circle, CircleDot, MoreHorizontal, Pencil, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { LoadMore } from '@/components/LoadMore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { issueIdentifier } from '@/features/issues/meta'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuePath, workspacePath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { remindersPageQuery, type Reminder, type RemindersPage, type ReminderStatus } from '../api'
import { useSetReminderStatus } from '../hooks'
import { formatReminderDay, formatReminderWhen, isOverdue } from '../when'
import { ReminderDialog } from './ReminderDialog'

type ReminderSectionProps = {
  title: string
  status: ReminderStatus
  teamId: string
  userId: string
  now: number
  /** A reminder to scroll to and outline (opened from a notification). */
  highlight: string | null
  /** Load further pages by scrolling (only the page's last section). */
  auto: boolean
  empty?: ReactNode
}

/** One section of the Notes page: the caller's notes with one status, a page at a time. */
export function ReminderSection({ title, status, teamId, userId, now, highlight, auto, empty }: ReminderSectionProps) {
  const query = useInfiniteQuery(remindersPageQuery(teamId, userId, status))
  if (query.isPending) return <div className="h-24 animate-pulse rounded-md bg-muted/40" aria-label={`Loading ${title.toLowerCase()}`} />
  if (query.isError) {
    return <div className="border-y py-8 text-center text-sm text-muted-foreground">Couldn’t load notes. Reload the page to try again.</div>
  }
  // Rows another section now owns (changed here a moment ago, before the refetch) are left out.
  const rows = rowsOf(query.data.pages).filter((r) => r.status === status)
  const total = Math.max(0, (query.data.pages[0]?.total ?? 0) - (rowsOf(query.data.pages).length - rows.length))
  if (total === 0 && !empty) return null

  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="font-mono text-xs text-muted-foreground">{total}</span>
      </div>
      {rows.length === 0 ? (
        <div className="border-y py-10 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <>
          <ul className="divide-y border-y">
            {rows.map((reminder) => (
              <ReminderRow key={reminder.id} reminder={reminder} now={now} highlighted={reminder.id === highlight} />
            ))}
          </ul>
          <LoadMore query={query} auto={auto} />
        </>
      )}
    </section>
  )
}

const showError = (error: unknown) => void toast.error(errorMessage(error))

/** The pages' rows in order. A reminder that moved between pages shows once. */
function rowsOf(pages: RemindersPage[]): Reminder[] {
  const seen = new Set<string>()
  return pages.flatMap((page) => page.rows).filter((row) => !seen.has(row.id) && seen.add(row.id))
}

function ReminderRow({ reminder, now, highlighted }: { reminder: Reminder; now: number; highlighted: boolean }) {
  const { team } = useCurrentTeam()
  const setStatus = useSetReminderStatus()
  const [editing, setEditing] = useState(false)
  const row = useRef<HTMLLIElement>(null)
  const pending = reminder.status === 'pending'
  const overdue = pending && isOverdue(reminder.remind_at, now)

  useEffect(() => {
    if (highlighted) row.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])

  const change = (status: ReminderStatus, done: string) =>
    setStatus(reminder.id, status).then(
      () =>
        toast.success(done, {
          action: status === 'pending' ? undefined : { label: 'Undo', onClick: () => void setStatus(reminder.id, 'pending').catch(showError) },
        }),
      showError,
    )

  const issueId = reminder.issue && reminder.workspace ? issueIdentifier(reminder.workspace.issue_key, reminder.issue.number) : null

  return (
    <li
      ref={row}
      className={cn(
        'group flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50',
        highlighted && 'bg-brand/5 ring-1 ring-brand/40 ring-inset',
      )}
    >
      <button
        type="button"
        onClick={() => (pending ? change('completed', 'Note marked done.') : change('pending', 'Note reopened.'))}
        aria-label={pending ? `Mark “${reminder.title}” done` : `Reopen “${reminder.title}”`}
        className="mt-0.5 shrink-0 rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {reminder.status === 'completed' ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-brand text-brand-foreground">
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : reminder.status === 'cancelled' ? (
          <X className="size-4" />
        ) : (
          <Circle className="size-4" />
        )}
      </button>

      <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left focus-visible:outline-none">
        <span className={cn('block truncate text-sm font-medium', !pending && 'text-muted-foreground', reminder.status === 'cancelled' && 'line-through')}>
          {reminder.title}
        </span>
        {reminder.notes && <span className="block truncate text-xs text-muted-foreground">{reminder.notes}</span>}
      </button>

      <span className="hidden min-w-0 shrink items-center gap-2 pt-0.5 text-xs text-muted-foreground sm:flex">
        {issueId && reminder.issue && reminder.workspace_id && (
          <Link
            to={issuePath(team.slug, reminder.workspace_id, reminder.issue.number)}
            title={reminder.issue.title}
            className="inline-flex shrink-0 items-center gap-1 font-mono hover:text-foreground"
          >
            <CircleDot className="size-3" /> {issueId}
          </Link>
        )}
        {reminder.workspace && reminder.workspace_id && (
          <Link to={workspacePath(team.slug, reminder.workspace_id)} className="max-w-40 truncate hover:text-foreground">
            {reminder.workspace.title}
          </Link>
        )}
      </span>

      <span
        className={cn('w-36 shrink-0 pt-0.5 text-right font-mono text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')}
        title={reminder.remind_at ? new Date(reminder.remind_at).toLocaleString() : undefined}
      >
        {reminder.status === 'completed' && reminder.completed_at
          ? `Done ${formatReminderDay(reminder.completed_at, now).toLowerCase()}`
          : reminder.status === 'cancelled' && reminder.cancelled_at
            ? `Archived ${formatReminderDay(reminder.cancelled_at, now).toLowerCase()}`
            : reminder.remind_at
              ? formatReminderWhen(reminder.remind_at, now)
              : ''}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Actions for “${reminder.title}”`} className="-my-0.5 text-muted-foreground">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {pending ? (
            <>
              <DropdownMenuItem onSelect={() => change('completed', 'Note marked done.')}>
                <Check /> Mark done
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => change('cancelled', 'Note archived.')}>
                <X /> Archive
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => change('pending', 'Note reopened.')}>
              <RotateCcw /> Reopen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editing && <ReminderDialog reminder={reminder} open onOpenChange={setEditing} />}
    </li>
  )
}
