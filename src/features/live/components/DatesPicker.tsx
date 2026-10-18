import { useState } from 'react'
import { startOfDay } from '../calendarView'
import { MAX_OCCURRENCES, toDateKey } from '../recurrence'
import { MonthGrid } from './MonthGrid'

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
  const selected = new Set(value)

  const toggle = (day: Date) => {
    const key = toDateKey(day)
    if (selected.has(key)) onChange(value.filter((k) => k !== key))
    else if (value.length < MAX_OCCURRENCES) onChange([...value, key].sort())
  }

  return (
    <div className="rounded-md border p-2">
      <MonthGrid
        month={month}
        onMonthChange={setMonth}
        isSelected={(day) => selected.has(toDateKey(day))}
        onPick={toggle}
        minDay={startOfDay(new Date())}
      />
      <p className="mt-1 px-1 text-xs text-muted-foreground">
        {value.length === 0 ? 'Click days to add them.' : `${value.length} ${value.length === 1 ? 'day' : 'days'} selected.`}
      </p>
    </div>
  )
}
