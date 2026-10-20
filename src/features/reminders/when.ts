// Reminder times as people read them. Stored as UTC instants (timestamptz); everything here is
// in the browser's time zone and locale, by calendar day, so DST changes don't shift "Tomorrow".
// No imports, so `npm run test:reminders` (Deno) can test it directly.

const MINUTE = 60_000

/** Local midnight of the day `at` falls on. */
function startOfDay(at: number): Date {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Calendar days from `now`'s day to `at`'s day (0 = same day, 1 = tomorrow, -1 = yesterday). */
export function dayOffset(at: number, now: number): number {
  // Rounded: a DST day is 23 or 25 hours long.
  return Math.round((startOfDay(at).getTime() - startOfDay(now).getTime()) / (24 * 60 * MINUTE))
}

type Formats = { time: Intl.DateTimeFormat; weekday: Intl.DateTimeFormat; date: Intl.DateTimeFormat; dateYear: Intl.DateTimeFormat }
let formats: Formats | null = null
function getFormats(): Formats {
  formats ??= {
    time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }),
    weekday: new Intl.DateTimeFormat(undefined, { weekday: 'long' }),
    date: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
    dateYear: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
  }
  return formats
}

/** "Today", "Tomorrow", "Yesterday", "Friday" (within the coming week), "Oct 22", "Oct 22, 2027". */
export function formatReminderDay(iso: string, now: number): string {
  const at = Date.parse(iso)
  const offset = dayOffset(at, now)
  const f = getFormats()
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  if (offset === -1) return 'Yesterday'
  if (offset > 1 && offset < 7) return f.weekday.format(at)
  return new Date(at).getFullYear() === new Date(now).getFullYear() ? f.date.format(at) : f.dateYear.format(at)
}

/** "Tomorrow · 9:00 AM" */
export function formatReminderWhen(iso: string, now: number): string {
  return `${formatReminderDay(iso, now)} · ${getFormats().time.format(Date.parse(iso))}`
}

/** A pending note whose time has passed (it has fired, or is about to). A note with no time never is. */
export const isOverdue = (iso: string | null, now: number) => iso !== null && Date.parse(iso) <= now

export type QuickTime = { label: string; at: Date }

/** At `hour`:00 local time, `days` calendar days after `now`'s day. */
function atHour(now: number, days: number, hour: number): Date {
  const d = startOfDay(now)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

/**
 * The dialog's one-click times: in an hour (to the next 5 minutes), later today at 5 PM (only
 * before 4 PM), tomorrow at 9 AM, and the coming Monday at 9 AM.
 */
export function quickTimes(now: number): QuickTime[] {
  const inAnHour = new Date(Math.ceil((now + 60 * MINUTE) / (5 * MINUTE)) * 5 * MINUTE)
  const today = new Date(now)
  const times: QuickTime[] = [{ label: 'In 1 hour', at: inAnHour }]
  if (today.getHours() < 16) times.push({ label: 'This afternoon', at: atHour(now, 0, 17) })
  times.push({ label: 'Tomorrow', at: atHour(now, 1, 9) })
  // The coming Monday (a week away on a Monday). On a Sunday that is tomorrow, already offered.
  const toMonday = ((8 - today.getDay()) % 7) || 7
  if (toMonday > 1) times.push({ label: 'Next Monday', at: atHour(now, toMonday, 9) })
  return times
}

/** The default for a new reminder: tomorrow at 9 AM. */
export const defaultRemindAt = (now: number) => atHour(now, 1, 9)
