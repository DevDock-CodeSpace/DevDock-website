// Dates in the person's time zone. "Today" is worked out here, on the server,
// rather than left to the model's arithmetic.

/** A usable IANA zone, or UTC. The browser's value is a hint, not a fact to trust. */
export function safeTimeZone(zone: unknown): string {
  if (typeof zone !== 'string' || zone.length > 64) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return 'UTC'
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function partsIn(date: Date, timeZone: string): Parts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

/** Minutes the zone is ahead of UTC at that instant. */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - date.getTime()) / 60_000)
}

/** The instant a calendar day starts in the zone. */
function startOfDay(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day)
  // Twice, because the offset at the guess can differ from the offset at the answer (DST).
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * 60_000)
}

/**
 * The instant a local date and time ("2026-10-19", "09:00") happens in the zone. A time that a
 * DST change skips lands just after the gap.
 */
export function zonedInstant(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  // Read with the offset in force half a day either side: on an ordinary day both agree. Around a
  // DST change, keep the one that really shows this wall-clock time (the earlier, if both do);
  // if neither does, the time was skipped, and the later one is just after the gap.
  const candidates = [-12, 12].map((hours) => new Date(wall - offsetMinutes(new Date(wall + hours * 3_600_000), timeZone) * 60_000))
  const exact = candidates.filter((at) => localTimeOfDay(at, timeZone) === time && localDate(at, timeZone) === date)
  if (exact.length > 0) return exact.reduce((a, b) => (a <= b ? a : b))
  return candidates.reduce((a, b) => (a >= b ? a : b))
}

/** "09:30" (24-hour) in the zone. */
export function localTimeOfDay(at: Date, timeZone: string): string {
  const p = partsIn(at, timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** "2026-10-12" in the zone. */
export function localDate(now: Date, timeZone: string): string {
  const p = partsIn(now, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export type DayRange = 'today' | 'tomorrow' | 'this_week' | 'next_week'

/** [from, to) for a named range, in the zone. Weeks run Monday to Sunday. */
export function rangeOf(range: DayRange, now: Date, timeZone: string): { from: Date; to: Date } {
  const p = partsIn(now, timeZone)
  const day = (offset: number) => startOfDay(p.year, p.month, p.day + offset, timeZone)
  if (range === 'today') return { from: day(0), to: day(1) }
  if (range === 'tomorrow') return { from: day(1), to: day(2) }
  // 0 = Monday.
  const weekday = (new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7
  const monday = range === 'this_week' ? -weekday : 7 - weekday
  return { from: day(monday), to: day(monday + 7) }
}

/** "Mon, Oct 12, 10:00 AM" in the zone. */
export function formatLocal(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** "Monday, October 12, 2026, 10:00 AM" in the zone, for the prompt. */
export function formatNow(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(now)
}
