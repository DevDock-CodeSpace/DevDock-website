import { CalendarDays, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { parseDateKey, toDateKey } from '../recurrence'
import { MonthGrid } from './MonthGrid'

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const dayYearFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
/** "Thu, Nov 12", with the year only when it isn't this year. */
const formatDay = (d: Date) => (d.getFullYear() === new Date().getFullYear() ? dayFormat : dayYearFormat).format(d)

type DateFieldProps = {
  id?: string
  /** "YYYY-MM-DD" (local). */
  value: string
  onChange: (value: string) => void
  /** Earliest day that can be picked, "YYYY-MM-DD". */
  min?: string
  disabled?: boolean
  className?: string
}

/** A date field that opens DevDock's month calendar (the one Meetings uses for "specific dates"). */
export function DateField({ id, value, onChange, min, disabled, className }: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = parseDateKey(value)
  const [month, setMonth] = useState(() => monthOf(selected ?? new Date()))

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Open on the chosen day's month.
        if (next) setMonth(monthOf(parseDateKey(value) ?? new Date()))
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-between px-3 font-normal', className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected ? formatDay(selected) : 'Pick a date'}
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          isSelected={(day) => toDateKey(day) === value}
          onPick={(day) => {
            onChange(toDateKey(day))
            setOpen(false)
          }}
          minDay={min ? (parseDateKey(min) ?? undefined) : undefined}
        />
      </PopoverContent>
    </Popover>
  )
}

const monthOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
