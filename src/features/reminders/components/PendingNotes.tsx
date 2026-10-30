import { useInfiniteQuery } from '@tanstack/react-query'
import { BellRing, Bookmark, Check } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { LoadMore } from '@/components/LoadMore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { remindersPageQuery, type Reminder, type RemindersPage } from '../api'
import { useChangeNoteStatus, useSnoozeNote } from '../hooks'
import { defaultRemindAt, formatReminderDay, formatReminderWhen, isOverdue } from '../when'
import { NoteContext } from './NoteContext'
import { NoteMenu } from './NoteMenu'
import { ReminderDialog } from './ReminderDialog'

type Props = { teamId: string; userId: string; now: number; highlight: string | null }

/** The pages' rows in order. A note that moved between pages shows once. */
function rowsOf(pages: RemindersPage[]): Reminder[] {
  const seen = new Set<string>()
  return pages.flatMap((page) => page.rows).filter((row) => !seen.has(row.id) && seen.add(row.id))
}

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * The open notes, in three shapes: **Due now** (its time has come: big cards with Done and Snooze,
 * where Calsko opens the panel), **Coming up** (a timeline by day) and **Anytime** (notes without a
 * time, as small cards). One list from the server, already in that order (time soonest first,
 * no time last), split here.
 */
export function PendingNotes({ teamId, userId, now, highlight }: Props) {
  const query = useInfiniteQuery(remindersPageQuery(teamId, userId, 'pending'))
  if (query.isPending) return <div className="h-32 animate-pulse rounded-xl bg-muted/40" aria-label="Loading notes" />
  if (query.isError) return <p className="py-8 text-center text-sm text-muted-foreground">Couldn’t load notes. Reload the page to try again.</p>

  // Rows another section owns now (changed a moment ago, before the refetch) are left out.
  const rows = rowsOf(query.data.pages).filter((r) => r.status === 'pending')
  // Newest first: the note that just came due (and opened the panel) is on top.
  const due = rows.filter((r) => isOverdue(r.remind_at, now)).sort((a, b) => Date.parse(b.remind_at!) - Date.parse(a.remind_at!))
  const upcoming = rows.filter((r) => r.remind_at && !isOverdue(r.remind_at, now))
  const anytime = rows.filter((r) => !r.remind_at)

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-10 text-center">
        <span className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Bookmark className="size-5" />
        </span>
        <p className="text-sm font-medium">Nothing on your mind?</p>
        <p className="mt-1 max-w-64 text-xs text-muted-foreground">
          Write anything above. Give it a time and Calsko opens it for you when that time comes.
        </p>
      </div>
    )
  }

  // Coming up, by day ("Today", "Tomorrow", "Friday", "Nov 3").
  const days: { day: string; notes: Reminder[] }[] = []
  for (const note of upcoming) {
    const day = formatReminderDay(note.remind_at!, now)
    const last = days.at(-1)
    if (last?.day === day) last.notes.push(note)
    else days.push({ day, notes: [note] })
  }

  return (
    <div className="space-y-6">
      {due.length > 0 && (
        <Section title="Due now" count={due.length} accent>
          <ul className="space-y-2">
            {due.map((note) => (
              <DueCard key={note.id} note={note} now={now} highlighted={note.id === highlight} />
            ))}
          </ul>
        </Section>
      )}
      {days.length > 0 && (
        <Section title="Coming up" count={upcoming.length}>
          <div className="space-y-3">
            {days.map(({ day, notes }) => (
              <div key={day}>
                <h4 className="mb-1 pl-17 text-[11px] font-medium text-muted-foreground">{day}</h4>
                <ol className="relative ml-15 border-l">
                  {notes.map((note) => (
                    <TimelineItem key={note.id} note={note} highlighted={note.id === highlight} />
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </Section>
      )}
      {anytime.length > 0 && (
        <Section title="Anytime" count={anytime.length}>
          <ul className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
            {anytime.map((note) => (
              <NoteCard key={note.id} note={note} highlighted={note.id === highlight} />
            ))}
          </ul>
        </Section>
      )}
      <LoadMore query={query} auto={false} />
    </div>
  )
}

function Section({ title, count, accent, children }: { title: string; count: number; accent?: boolean; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className={cn('mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase', accent ? 'text-brand' : 'text-muted-foreground')}>
        {title}
        <span className="font-mono font-normal">{count}</span>
      </h3>
      {children}
    </section>
  )
}

/** Scrolls a note opened from its notification into view; returns the ref for its element. */
function useScrollTo<T extends HTMLElement>(highlighted: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlighted])
  return ref
}

/** A note whose time has come: what it says, and what to do about it. */
function DueCard({ note, now, highlighted }: { note: Reminder; now: number; highlighted: boolean }) {
  const change = useChangeNoteStatus()
  const snooze = useSnoozeNote()
  const [editing, setEditing] = useState(false)
  const ref = useScrollTo<HTMLLIElement>(highlighted)
  const later = (minutes: number, label: string) => void snooze(note, new Date(Date.now() + minutes * 60_000), label)
  return (
    <li
      ref={ref}
      className={cn(
        'rounded-xl border border-brand/30 bg-brand/[0.06] p-3 transition-shadow dark:bg-brand/10',
        highlighted && 'shadow-md ring-2 ring-brand/40',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
          {highlighted && <span className="absolute inset-0 rounded-full bg-brand/50 motion-safe:animate-ping" />}
          <BellRing className="relative size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-brand">{formatReminderWhen(note.remind_at!, now)}</p>
          <button type="button" onClick={() => setEditing(true)} className="block w-full text-left focus-visible:outline-none">
            <span className="block text-[15px] leading-snug font-semibold break-words">{note.title}</span>
            {note.notes && <span className="mt-1 line-clamp-4 block text-sm break-words whitespace-pre-line text-muted-foreground">{note.notes}</span>}
          </button>
          <NoteContext reminder={note} className="mt-1.5" />
        </div>
        <NoteMenu reminder={note} onEdit={() => setEditing(true)} className="-mt-1 -mr-1" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button size="xs" onClick={() => void change(note, 'completed', 'Note marked done.')}>
          <Check /> Done
        </Button>
        <span className="ml-1 text-[11px] text-muted-foreground">Snooze</span>
        <Button size="xs" variant="outline" className="bg-background" onClick={() => later(10, 'in 10 minutes')}>
          10 min
        </Button>
        <Button size="xs" variant="outline" className="bg-background" onClick={() => later(60, 'in an hour')}>
          1 hour
        </Button>
        <Button
          size="xs"
          variant="outline"
          className="bg-background"
          onClick={() => void snooze(note, defaultRemindAt(Date.now()), formatReminderWhen(defaultRemindAt(Date.now()).toISOString(), Date.now()).toLowerCase())}
        >
          Tomorrow
        </Button>
      </div>
      {editing && <ReminderDialog reminder={note} open onOpenChange={setEditing} />}
    </li>
  )
}

/** A note with a time still to come, on the day's timeline: the time on the left, a dot on the line. */
function TimelineItem({ note, highlighted }: { note: Reminder; highlighted: boolean }) {
  const change = useChangeNoteStatus()
  const [editing, setEditing] = useState(false)
  const ref = useScrollTo<HTMLLIElement>(highlighted)
  return (
    <li ref={ref} className={cn('group relative rounded-r-md py-1.5 pr-1 pl-4 hover:bg-muted/40', highlighted && 'bg-brand/5 ring-1 ring-brand/40 ring-inset')}>
      <time
        dateTime={note.remind_at!}
        title={new Date(note.remind_at!).toLocaleString()}
        className="absolute top-2 -left-15 w-12 text-right font-mono text-[11px] text-muted-foreground"
      >
        {time.format(Date.parse(note.remind_at!))}
      </time>
      <span className="absolute top-2.5 -left-[5px] size-2.5 rounded-full border-2 border-background bg-brand" aria-hidden />
      <div className="flex items-start gap-1">
        <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 text-left focus-visible:outline-none">
          <span className="block text-sm font-medium break-words">{note.title}</span>
          {note.notes && <span className="mt-0.5 line-clamp-2 block text-xs break-words text-muted-foreground">{note.notes}</span>}
        </button>
        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
          <Button variant="ghost" size="icon-xs" aria-label={`Mark “${note.title}” done`} title="Mark done" className="text-muted-foreground" onClick={() => void change(note, 'completed', 'Note marked done.')}>
            <Check />
          </Button>
          <NoteMenu reminder={note} onEdit={() => setEditing(true)} />
        </span>
      </div>
      <NoteContext reminder={note} className="mt-0.5" />
      {editing && <ReminderDialog reminder={note} open onOpenChange={setEditing} />}
    </li>
  )
}

/** A note without a time: a small card, like a sticky note. */
function NoteCard({ note, highlighted }: { note: Reminder; highlighted: boolean }) {
  const change = useChangeNoteStatus()
  const [editing, setEditing] = useState(false)
  const ref = useScrollTo<HTMLLIElement>(highlighted)
  return (
    <li
      ref={ref}
      className={cn(
        'group relative flex min-h-24 flex-col rounded-lg border bg-muted/30 p-2.5 transition-colors hover:border-foreground/15 hover:bg-muted/50',
        highlighted && 'ring-2 ring-brand/40',
      )}
    >
      <button type="button" onClick={() => setEditing(true)} className="min-w-0 text-left after:absolute after:inset-0 focus-visible:outline-none">
        <span className="line-clamp-3 block text-sm leading-snug font-medium break-words">{note.title}</span>
        {note.notes && <span className="mt-1 line-clamp-4 block text-xs break-words whitespace-pre-line text-muted-foreground">{note.notes}</span>}
      </button>
      <div className="mt-auto flex items-center gap-0.5 pt-2">
        <NoteContext reminder={note} className="flex-1" />
        <span className="ml-auto flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
          <Button variant="ghost" size="icon-xs" aria-label={`Mark “${note.title}” done`} title="Mark done" className="relative z-10 text-muted-foreground" onClick={() => void change(note, 'completed', 'Note marked done.')}>
            <Check />
          </Button>
          <NoteMenu reminder={note} onEdit={() => setEditing(true)} />
        </span>
      </div>
      {editing && <ReminderDialog reminder={note} open onOpenChange={setEditing} />}
    </li>
  )
}
