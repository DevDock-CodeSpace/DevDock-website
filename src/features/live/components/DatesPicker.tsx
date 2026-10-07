import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isSameDay, monthWeeks, startOfDay, weekDays } from '../calendarView'
import { MAX_OCCURRENCES, toDateKey } from '../recurrence'

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const weekdayLetter = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })

type DatesPickerProps = {
  /** Selected days, "YYYY-MM-DD". */
  value: string[]
  onChange: (value: string[]) => void
  /** Month shown first. */
  initialMonth: Date
}

/** A small month calendar where each click adds or removes a day. Past days are disabled. */
export function DatesPicker({ value, onChange, initialMonth }: DatesPickerProps) {
  const [month, setMonth] = useState(() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1))
  const today = startOfDay(new Date())
  const selected = new Set(value)

  const toggle = (day: Date) => {
    const key = toDateKey(day)
    if (selected.has(key)) onChange(value.filter((k) => k !== key))
    else if (value.length < MAX_OCCURRENCES) onChange([...value, key].sort())
  }

  return (
    <div className="rounded-md border p-2">
      <div className="mb-1 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          {monthTitle.format(month)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Next month"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">
        {weekDays(month).map((d) => (
          <span key={d.getDay()} className="py-1">
            {weekdayLetter.format(d)}
          </span>
        ))}
      </div>
      {monthWeeks(month).map((week) => (
        <div key={toDateKey(week[0])} className="grid grid-cols-7">
          {week.map((day) => {
            const key = toDateKey(day)
            const isSelected = selected.has(key)
            const past = day < today
            return (
              <button
                key={key}
                type="button"
                disabled={past}
                aria-pressed={isSelected}
                aria-label={day.toDateString()}
                onClick={() => toggle(day)}
                className={cn(
                  'm-0.5 flex h-8 items-center justify-center rounded-md font-mono text-xs transition-colors',
                  day.getMonth() !== month.getMonth() && 'text-muted-foreground/60',
                  past && 'cursor-not-allowed opacity-40',
                  !past && !isSelected && 'hover:bg-muted',
                  isSelected && 'bg-brand text-white',
                  !isSelected && isSameDay(day, today) && 'ring-1 ring-border',
                )}
              >
                {day.getDate()}
              </button>
            )
          })}
        </div>
      ))}
      <p className="mt-1 px-1 text-xs text-muted-foreground">
        {value.length === 0 ? 'Click days to add them.' : `${value.length} ${value.length === 1 ? 'day' : 'days'} selected.`}
      </p>
    </div>
  )
}
