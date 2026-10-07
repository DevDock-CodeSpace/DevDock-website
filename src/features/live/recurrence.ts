// Repeating meetings. A rule is expanded in the browser into the exact list of
// start times, and the database stores them as ordinary rows (one series_id).
// Everything works on local wall-clock time, so "10:00 every weekday" stays at
// 10:00 across a daylight-saving change.

export const MAX_OCCURRENCES = 60
export const DEFAULT_OCCURRENCES = 10

export type RepeatKind = 'none' | 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'dates'

export type RepeatEnd = { mode: 'count'; count: number } | { mode: 'until'; until: string }

export type RepeatRule = {
  kind: RepeatKind
  /** Weekly: days of the week, 0 = Sunday … 6 = Saturday. */
  days: number[]
  /** Specific dates ("YYYY-MM-DD"), used when kind is 'dates'. */
  dates: string[]
  end: RepeatEnd
}

export const repeatKinds: { value: RepeatKind; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekends', label: 'Every weekend (Sat–Sun)' },
  { value: 'weekly', label: 'Weekly on chosen days' },
  { value: 'dates', label: 'On specific dates' },
]

export const noRepeat = (): RepeatRule => ({
  kind: 'none',
  days: [],
  dates: [],
  end: { mode: 'count', count: DEFAULT_OCCURRENCES },
})

const pad = (n: number) => String(n).padStart(2, '0')

export const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** "YYYY-MM-DD" → local midnight; null when it isn't a real date. */
export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

function atTime(day: Date, time: string): Date | null {
  const match = /^(\d{2}):(\d{2})/.exec(time)
  if (!match) return null
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(match[1]), Number(match[2]))
}

const matchesDay = (rule: RepeatRule, weekday: number) => {
  switch (rule.kind) {
    case 'daily':
      return true
    case 'weekdays':
      return weekday >= 1 && weekday <= 5
    case 'weekends':
      return weekday === 0 || weekday === 6
    case 'weekly':
      return rule.days.includes(weekday)
    default:
      return false
  }
}

/**
 * Every start time the rule produces, soonest first (at most MAX_OCCURRENCES).
 * `startDate`/`time` are the first meeting's local date and time; for 'dates'
 * the chosen dates are used instead of `startDate`.
 */
export function generateStarts(startDate: string, time: string, rule: RepeatRule): Date[] {
  const first = parseDateKey(startDate)
  if (!first) return []

  if (rule.kind === 'none') {
    const only = atTime(first, time)
    return only ? [only] : []
  }

  if (rule.kind === 'dates') {
    return [...new Set(rule.dates)]
      .sort()
      .slice(0, MAX_OCCURRENCES)
      .flatMap((key) => {
        const day = parseDateKey(key)
        const start = day && atTime(day, time)
        return start ? [start] : []
      })
  }

  const limit = rule.end.mode === 'count' ? Math.min(rule.end.count, MAX_OCCURRENCES) : MAX_OCCURRENCES
  const until = rule.end.mode === 'until' ? parseDateKey(rule.end.until) : null
  if (rule.end.mode === 'until' && !until) return []

  const starts: Date[] = []
  // A year of days is more than enough to find 60 matches for any rule.
  for (let offset = 0; offset < 366 && starts.length < limit; offset++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset)
    if (until && day > until) break
    if (!matchesDay(rule, day.getDay())) continue
    const start = atTime(day, time)
    if (start) starts.push(start)
  }
  return starts
}

const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

/** Short weekday names in Sunday-first order, for the day chips. */
export const WEEKDAY_NAMES = Array.from({ length: 7 }, (_, i) => weekdayShort.format(new Date(2024, 0, 7 + i)))

/** "Every weekday · 10 meetings · Oct 8 – Oct 21" */
export function describeSeries(rule: RepeatRule, starts: Date[]): string {
  if (rule.kind === 'none' || starts.length === 0) return ''
  const label =
    rule.kind === 'weekly'
      ? `Weekly on ${rule.days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => WEEKDAY_NAMES[d])
          .join(', ')}`
      : rule.kind === 'dates'
        ? 'Specific dates'
        : (repeatKinds.find((k) => k.value === rule.kind)?.label.replace(/ \(.*\)/, '') ?? '')
  const count = `${starts.length} ${starts.length === 1 ? 'meeting' : 'meetings'}`
  const first = starts[0]
  const last = starts[starts.length - 1]
  const range = starts.length > 1 ? `${monthDay.format(first)} – ${monthDay.format(last)}` : monthDay.format(first)
  return [label, count, range].join(' · ')
}

/** Why the rule can't be used yet, or null when it's fine. */
export function repeatProblem(rule: RepeatRule, starts: Date[]): string | null {
  if (rule.kind === 'none') return null
  if (rule.kind === 'weekly' && rule.days.length === 0) return 'Pick at least one day of the week.'
  if (rule.kind === 'dates' && rule.dates.length === 0) return 'Pick at least one date on the calendar.'
  if (rule.kind === 'dates' && rule.dates.length > MAX_OCCURRENCES) return `Pick at most ${MAX_OCCURRENCES} dates.`
  if (rule.end.mode === 'until' && rule.kind !== 'dates' && !parseDateKey(rule.end.until)) return 'Pick an end date.'
  if (starts.length === 0) return 'No meetings fall in that range. Try a later end date.'
  return null
}

/** Google Calendar RDATE line (local time in `timeZone`) for the occurrences after the first. */
export function toRdate(starts: Date[], timeZone: string): string | null {
  if (starts.length < 2) return null
  const stamp = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
  return `RDATE;TZID=${timeZone}:${starts.slice(1).map(stamp).join(',')}`
}
