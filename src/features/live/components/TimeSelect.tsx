import { ChevronDown, Clock } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { parseTimeInput, splitTime, timesInPeriod, withPeriod, type Period } from '../timeOfDay'

type TimeSelectProps = {
  id?: string
  /** "HH:MM" (local, 24-hour). */
  value: string
  onChange: (value: string) => void
}

/**
 * A time of day: a box you can type any time into ("9:05", "905", "14:30", "7pm"), a short list
 * of half hours for the half of the day in view, and an AM/PM switch. Shown as 12-hour time.
 */
export function TimeSelect({ id, value, onChange }: TimeSelectProps) {
  const { text, period } = splitTime(value)
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const invalid = draft !== null && parseTimeInput(draft, period) === null
  const options = timesInPeriod(period)
  // The listed time to centre on: the value, or the half hour before a custom one (7:05 → 7:00).
  const nearest = options.filter((t) => t <= value).at(-1) ?? options[0]
  // Scrolls only the list (never the dialog or page behind it), once each time it opens.
  // A stable callback ref runs on mount, not on every render.
  const centreList = useCallback((list: HTMLUListElement | null) => {
    const item = list?.querySelector<HTMLElement>('[data-nearest]')
    if (list && item) list.scrollTop = item.offsetTop - list.clientHeight / 2 + item.offsetHeight / 2
  }, [])

  // A typed time takes effect when the box is left or Enter is pressed; nonsense reverts.
  const commit = () => {
    if (draft === null) return
    const next = parseTimeInput(draft, period)
    if (next && next !== value) onChange(next)
    setDraft(null)
  }

  return (
    <div className="flex w-full min-w-0 gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div ref={box} className="relative min-w-0 flex-1">
            <Clock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={id}
              value={draft ?? text}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={invalid}
              aria-label={id ? undefined : 'Time'}
              className="pr-7 pl-8 font-mono"
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              onClick={() => setOpen(true)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commit()
                  setOpen(false)
                } else if (e.key === 'ArrowDown') setOpen(true)
                else if (e.key === 'Escape' && draft !== null) {
                  // Undo the typing first; a second Escape closes as usual.
                  e.stopPropagation()
                  setDraft(null)
                }
              }}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label="Show times"
              onClick={() => setOpen((o) => !o)}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-32 p-1"
          // Keep the cursor in the box, so typing still works with the list open.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target instanceof Node && box.current?.contains(e.target)) e.preventDefault()
          }}
        >
          <ul ref={centreList} role="listbox" aria-label={`Times, ${period}`} className="relative max-h-60 overflow-y-auto">
            {options.map((time) => {
              const selected = time === value
              return (
                <li key={time}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-nearest={time === nearest ? '' : undefined}
                    onClick={() => {
                      setDraft(null)
                      onChange(time)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full rounded-sm px-2 py-1 text-left font-mono text-xs transition-colors hover:bg-muted',
                      selected && 'bg-muted font-medium text-foreground',
                    )}
                  >
                    {splitTime(time).text}
                  </button>
                </li>
              )
            })}
          </ul>
        </PopoverContent>
      </Popover>

      <div role="group" aria-label="AM or PM" className="flex shrink-0 rounded-md border p-0.5">
        {(['AM', 'PM'] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={period === p}
            onClick={() => period !== p && onChange(withPeriod(value, p))}
            className={cn(
              'rounded px-1.5 font-mono text-[11px] font-medium transition-colors',
              period === p ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}
