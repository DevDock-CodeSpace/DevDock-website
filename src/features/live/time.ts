import type { LiveSession } from './api'

/** Mirrors the jaas-token Edge Function: open 15 min early, joinable 1 h after the end. */
export const EARLY_JOIN_MS = 15 * 60_000
export const LATE_JOIN_MS = 60 * 60_000

export type SessionStatus = 'upcoming' | 'live' | 'ended'

type Times = Pick<LiveSession, 'starts_at' | 'ends_at'>

export function sessionStatus(session: Times, now: number): SessionStatus {
  const start = Date.parse(session.starts_at)
  const end = Date.parse(session.ends_at)
  if (now >= end) return 'ended'
  if (now >= start) return 'live'
  return 'upcoming'
}

/** Whether the Join button works now. Moderators may open the room early. */
export function canJoin(session: Times, now: number, moderator: boolean): boolean {
  const start = Date.parse(session.starts_at)
  const end = Date.parse(session.ends_at)
  if (now > end + LATE_JOIN_MS) return false
  return moderator || now >= start - EARLY_JOIN_MS
}

const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/** "Thu, Sep 26" */
export const formatDay = (iso: string) => dayFormat.format(new Date(iso))
/** "2:00 PM" (or "14:00", by locale) */
export const formatTime = (iso: string) => timeFormat.format(new Date(iso))
/** "2:00 PM – 3:00 PM" */
export const formatTimeRange = (session: Times) => `${formatTime(session.starts_at)} – ${formatTime(session.ends_at)}`

/** "1 h", "45 min", "1 h 30 min" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h} h ${m} min`
  return h ? `${h} h` : `${m} min`
}

export const durationMinutes = (session: Times) =>
  Math.round((Date.parse(session.ends_at) - Date.parse(session.starts_at)) / 60_000)

const pad = (n: number) => String(n).padStart(2, '0')

/** Local "YYYY-MM-DD" and "HH:MM" for date/time inputs. */
export function toLocalInputs(date: Date): { date: string; time: string } {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

/** Local date + time inputs → ISO timestamp; null if invalid. */
export function fromLocalInputs(date: string, time: string): Date | null {
  const parsed = new Date(`${date}T${time}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** The next full hour from `now`, as the default start. */
export function nextFullHour(now: number): Date {
  const d = new Date(now)
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}

/** Upcoming/live first (soonest first), then ended (most recent first). */
export function splitSessions<T extends Times>(sessions: T[], now: number) {
  const current = sessions.filter((s) => sessionStatus(s, now) !== 'ended')
  const past = sessions.filter((s) => sessionStatus(s, now) === 'ended').reverse()
  return { current, past }
}
