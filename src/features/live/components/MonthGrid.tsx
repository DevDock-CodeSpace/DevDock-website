import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isSameDay, monthWeeks, startOfDay, weekDays } from '../calendarView'
import { toDateKey } from '../recurrence'

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const weekdayLetter = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })

type MonthGridProps = {
  /** First day of the month shown. */
  month: Date
  onMonthChange: (month: Date) => void
  isSelected: (day: Date) => boolean
  onPick: (day: Date) => void
  /** Days before this one can't be picked. */
  minDay?: Date
}

/** A small month calendar (DevDock style): ‹ month › header, weekday letters, and a grid of days. */
export function MonthGrid({ month, onMonthChange, isSelected, onPick, minDay }: MonthGridProps) {
  const today = startOfDay(new Date())
  const min = minDay ? startOfDay(minDay) : null
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous month"
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
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
          onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
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
            const selected = isSelected(day)
            const blocked = min !== null && day < min
            return (
              <button
                key={key}
                type="button"
                disabled={blocked}
                aria-pressed={selected}
                aria-label={day.toDateString()}
                onClick={() => onPick(day)}
                className={cn(
                  'm-0.5 flex h-8 items-center justify-center rounded-md font-mono text-xs transition-colors',
                  day.getMonth() !== month.getMonth() && 'text-muted-foreground/60',
                  blocked && 'cursor-not-allowed opacity-40',
                  !blocked && !selected && 'hover:bg-muted',
                  selected && 'bg-brand text-white',
                  !selected && isSameDay(day, today) && 'ring-1 ring-border',
                )}
              >
                {day.getDate()}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
