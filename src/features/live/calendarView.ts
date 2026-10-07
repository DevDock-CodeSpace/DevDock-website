import type { LiveSession } from './api'
import { parseDateKey, toDateKey } from './recurrence'

// Date math for the Meetings calendar. Weeks start on Monday.

export type CalendarMode = 'month' | 'week'

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** Monday of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const offset = (d.getDay() + 6) % 7
  return addDays(startOfDay(d), -offset)
}

/** Whole weeks (Mon–Sun rows) covering the month of `d`. */
export function monthWeeks(d: Date): Date[][] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const weeks: Date[][] = []
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)))
  }
  return weeks
}

export const weekDays = (d: Date): Date[] => {
  const start = startOfWeek(d)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Move the visible range by one month or one week. */
export function shiftCursor(d: Date, mode: CalendarMode, direction: 1 | -1): Date {
  return mode === 'month'
    ? new Date(d.getFullYear(), d.getMonth() + direction, 1)
    : addDays(d, 7 * direction)
}

export const isSameDay = (a: Date, b: Date) => toDateKey(a) === toDateKey(b)

export function readCursor(param: string | null, now: number): Date {
  return (param && parseDateKey(param)) || startOfDay(new Date(now))
}

/** Sessions grouped by local start day ("YYYY-MM-DD"), soonest first within a day. */
export function groupByDay(sessions: LiveSession[]): Map<string, LiveSession[]> {
  const byDay = new Map<string, LiveSession[]>()
  for (const session of sessions) {
    const key = toDateKey(new Date(session.starts_at))
    byDay.set(key, [...(byDay.get(key) ?? []), session])
  }
  for (const list of byDay.values()) list.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  return byDay
}

export type PlacedSession = { session: LiveSession; top: number; height: number; column: number; columns: number }

export const MINUTES_PER_DAY = 24 * 60
const MIN_HEIGHT_MINUTES = 25

/** Positions one day's sessions in the time grid; overlapping ones sit side by side. */
export function layoutDay(sessions: LiveSession[]): PlacedSession[] {
  const items = sessions.map((session) => {
    const start = new Date(session.starts_at)
    const from = start.getHours() * 60 + start.getMinutes()
    const length = (Date.parse(session.ends_at) - Date.parse(session.starts_at)) / 60_000
    const to = Math.min(MINUTES_PER_DAY, from + Math.max(length, MIN_HEIGHT_MINUTES))
    return { session, from, to }
  })
  items.sort((a, b) => a.from - b.from)

  const placed: PlacedSession[] = []
  let cluster: { item: (typeof items)[number]; column: number }[] = []
  let clusterEnd = 0
  const flush = () => {
    const columns = Math.max(1, ...cluster.map((c) => c.column + 1))
    for (const { item, column } of cluster) {
      placed.push({ session: item.session, top: item.from, height: item.to - item.from, column, columns })
    }
    cluster = []
  }
  for (const item of items) {
    if (cluster.length && item.from >= clusterEnd) flush()
    const taken = new Set(cluster.filter((c) => c.item.to > item.from).map((c) => c.column))
    let column = 0
    while (taken.has(column)) column++
    cluster.push({ item, column })
    clusterEnd = Math.max(clusterEnd, item.to)
  }
  flush()
  return placed
}
