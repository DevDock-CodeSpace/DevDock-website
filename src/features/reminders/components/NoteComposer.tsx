import { AlarmClock, ArrowUp, CalendarClock, X } from 'lucide-react'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useNow } from '@/features/live/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { NOTES_MAX, TITLE_MAX } from '../api'
import { useCreateReminder } from '../hooks'
import { formatReminderWhen, quickTimes, type QuickTime } from '../when'
import { ReminderDialog } from './ReminderDialog'

/** The first line is the title, the rest the note's text. */
function split(text: string) {
  const [first = '', ...rest] = text.trim().split('\n')
  return { title: first.trim().slice(0, TITLE_MAX), notes: rest.join('\n').trim().slice(0, NOTES_MAX) }
}

/**
 * The Notes panel's write box: type, press Enter, done. "Remind me" adds one of the quick times;
 * "Pick a date and time" carries the text over to the full dialog (workspace and issue live there too).
 */
export function NoteComposer() {
  const { team } = useCurrentTeam()
  const create = useCreateReminder()
  const now = useNow()
  const [text, setText] = useState('')
  const [time, setTime] = useState<QuickTime | null>(null)
  const [times, setTimes] = useState<QuickTime[]>([])
  const [picking, setPicking] = useState(false)
  const [detailed, setDetailed] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const { title, notes } = split(text)

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!title || create.isPending) return
    const remindAt = time?.at.toISOString() ?? null
    create.mutate(
      { teamId: team.id, title, notes, remindAt },
      {
        onSuccess: () => {
          setText('')
          setTime(null)
          box.current?.focus()
          toast.success(remindAt ? `Saved. DevDock will open it ${formatReminderWhen(remindAt, Date.now()).toLowerCase()}.` : 'Note saved.')
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event)
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border bg-background shadow-xs transition-shadow focus-within:border-brand/50 focus-within:ring-3 focus-within:ring-brand/15"
    >
      <textarea
        ref={box}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        rows={text.includes('\n') ? 4 : 2}
        maxLength={TITLE_MAX + NOTES_MAX + 1}
        aria-label="Write a note"
        placeholder="Write a note…  (Shift+Enter for a new line)"
        className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground/70"
      />
      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        {time ? (
          <span className="flex h-7 items-center gap-1.5 rounded-md bg-brand/10 pr-1 pl-2 text-xs font-medium text-brand">
            <AlarmClock className="size-3.5" />
            {formatReminderWhen(time.at.toISOString(), now)}
            <button type="button" aria-label="No time" onClick={() => setTime(null)} className="rounded-sm p-0.5 hover:bg-brand/15">
              <X className="size-3" />
            </button>
          </span>
        ) : (
          <Popover
            open={picking}
            onOpenChange={(open) => {
              // The times are worked out on opening, so "In 1 hour" is an hour from now.
              if (open) setTimes(quickTimes(Date.now()))
              setPicking(open)
            }}
          >
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="xs" className="text-muted-foreground">
                <AlarmClock /> Remind me
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 gap-0 p-1">
              {times.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => {
                    setTime(option)
                    setPicking(false)
                    box.current?.focus()
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  {option.label}
                  <span className="font-mono text-[11px] text-muted-foreground">{formatReminderWhen(option.at.toISOString(), now)}</span>
                </button>
              ))}
              <div className="my-1 border-t" />
              <button
                type="button"
                onClick={() => {
                  setPicking(false)
                  setDetailed(true)
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <CalendarClock className="size-4 text-muted-foreground" /> Pick a date and time…
              </button>
            </PopoverContent>
          </Popover>
        )}
        <span className="flex-1" />
        <Button
          type="submit"
          size="icon-xs"
          disabled={!title || create.isPending}
          aria-label="Save note"
          title="Save (Enter)"
          className={cn('rounded-full', !title && 'opacity-40')}
        >
          <ArrowUp />
        </Button>
      </div>
      {detailed && (
        <ReminderDialog
          draft={{ title, notes }}
          open
          onOpenChange={setDetailed}
          onSaved={() => {
            setText('')
            setTime(null)
          }}
        />
      )}
    </form>
  )
}
