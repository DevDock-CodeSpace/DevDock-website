import { connectGoogleCalendar } from '@/features/auth/api'
import { clearCalendarToken, getCalendarToken } from '@/features/auth/google-calendar'
import { DataError } from '@/lib/errors'
import {
  fetchInvitees,
  fetchSeriesSessions,
  saveRsvps,
  setCalendarEventId,
  setSeriesCalendarEventId,
  type LiveSession,
} from './api'
import { toRdate } from './recurrence'

// Google Calendar sync for live sessions. The organizer's own calendar holds
// the event; everyone the session is for is an attendee, and Google emails
// them (sendUpdates=all) on create, change and cancel.
//
// Calendar calls need the organizer's Google token (features/auth/google-calendar).
// When it's missing or expired, the change is queued in sessionStorage, the
// organizer goes through Google once, and useCalendarQueue() finishes the work
// on the page they come back to.

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const QUEUE_KEY = 'devdock:calendar-queue'

export type CalendarOp =
  /** Create the event, or update it when the session already has one. */
  | { kind: 'sync'; sessionId: string; url: string }
  /** One recurring event for a whole series (every meeting shares its id). */
  | { kind: 'sync_series'; seriesId: string; url: string }
  /** Cancel an event whose session was deleted. */
  | { kind: 'delete'; eventId: string }

class CalendarAuthError extends Error {}

async function calendarFetch(token: string, path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${EVENTS_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (response.status === 401) {
    clearCalendarToken()
    throw new CalendarAuthError('Google Calendar token expired')
  }
  return response
}

function eventBody(session: LiveSession, invitees: string[], url: string, series: LiveSession[] = []) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // The first meeting is the event itself; the rest are listed as extra dates.
  const rdate = toRdate(series.map((s) => new Date(s.starts_at)), timeZone)
  const description = [session.description?.trim(), `Join in DevDock: ${url}`].filter(Boolean).join('\n\n')
  return {
    summary: session.title,
    description,
    location: url,
    start: { dateTime: session.starts_at, timeZone },
    end: { dateTime: session.ends_at, timeZone },
    attendees: invitees.map((email) => ({ email })),
    source: { title: 'DevDock', url },
    guestsCanInviteOthers: false,
    reminders: { useDefault: true },
    ...(rdate ? { recurrence: [rdate] } : {}),
  }
}

async function syncEvent(token: string, session: LiveSession, url: string): Promise<void> {
  const invitees = await fetchInvitees(session.id)
  const body = JSON.stringify(eventBody(session, invitees, url))
  if (session.calendar_event_id) {
    const response = await calendarFetch(token, `/${encodeURIComponent(session.calendar_event_id)}?sendUpdates=all`, {
      method: 'PATCH',
      body,
    })
    if (response.ok) {
      await storeRsvps([session.id], (await response.json()) as GoogleEvent)
      return
    }
    // Deleted in Google Calendar: make a new one below.
    if (response.status !== 404 && response.status !== 410) throw await googleError(response)
  }
  const response = await calendarFetch(token, '?sendUpdates=all', { method: 'POST', body })
  if (!response.ok) throw await googleError(response)
  const event = (await response.json()) as GoogleEvent
  await setCalendarEventId(session.id, event.id)
  await storeRsvps([session.id], event)
}

/** Creates or updates the single recurring event behind a series. */
async function syncSeriesEvent(token: string, seriesId: string, url: string): Promise<void> {
  const series = await fetchSeriesSessions(seriesId)
  const first = series[0]
  // Cancelled in the meantime.
  if (!first) return
  const invitees = await fetchInvitees(first.id)
  const body = JSON.stringify(eventBody(first, invitees, url, series))
  if (first.calendar_event_id) {
    const response = await calendarFetch(token, `/${encodeURIComponent(first.calendar_event_id)}?sendUpdates=all`, {
      method: 'PATCH',
      body,
    })
    if (response.ok) {
      await storeRsvps(series.map((s) => s.id), (await response.json()) as GoogleEvent)
      return
    }
    if (response.status !== 404 && response.status !== 410) throw await googleError(response)
  }
  const response = await calendarFetch(token, '?sendUpdates=all', { method: 'POST', body })
  if (!response.ok) throw await googleError(response)
  const event = (await response.json()) as GoogleEvent
  await setSeriesCalendarEventId(seriesId, event.id)
  await storeRsvps(series.map((s) => s.id), event)
}

async function deleteEvent(token: string, eventId: string): Promise<void> {
  const response = await calendarFetch(token, `/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: 'DELETE' })
  // Already gone is fine.
  if (!response.ok && response.status !== 404 && response.status !== 410) throw await googleError(response)
}

type GoogleEvent = { id: string; attendees?: { email?: string; responseStatus?: string; self?: boolean }[] }

/**
 * Mirrors the event's attendee replies into DevDock. The organizer is skipped
 * (they're not an invitee), and only their own token is ever used, so nobody
 * else has to connect a calendar for this to work.
 */
async function storeRsvps(sessionIds: string[], event: GoogleEvent): Promise<void> {
  const responses = (event.attendees ?? [])
    .filter((a) => !a.self && a.email)
    .map((a) => ({ email: a.email as string, status: a.responseStatus ?? 'needsAction' }))
  // Replies belong to every meeting of a series, which share one Google event.
  for (const id of sessionIds) await saveRsvps(id, responses)
}

/** Reads the event again and refreshes the stored replies. Organizers only. */
export async function refreshRsvps(session: LiveSession): Promise<boolean> {
  const token = getCalendarToken()
  if (!token || !session.calendar_event_id) return false
  const response = await calendarFetch(token, `/${encodeURIComponent(session.calendar_event_id)}`, { method: 'GET' })
  if (!response.ok) {
    // Nothing to mirror (deleted in Google, or the token lost its scope).
    if (response.status === 404 || response.status === 410) return false
    throw await googleError(response)
  }
  const event = (await response.json()) as GoogleEvent
  const ids = session.series_id ? (await fetchSeriesSessions(session.series_id)).map((s) => s.id) : [session.id]
  await storeRsvps(ids, event)
  return true
}

async function googleError(response: Response): Promise<DataError> {
  const detail = await response.text().catch(() => '')
  console.error('[calendar] Google Calendar API error', response.status, detail)
  const message =
    response.status === 403
      ? 'Google Calendar refused the change. Make sure you allowed DevDock to manage calendar events.'
      : 'Couldn’t update Google Calendar. Please try again.'
  return new DataError(message, String(response.status))
}

// ------------------------------------------------------------------ queue

function readQueue(): CalendarOp[] {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as CalendarOp[]) : []
  } catch {
    return []
  }
}

function writeQueue(ops: CalendarOp[]) {
  try {
    if (ops.length) sessionStorage.setItem(QUEUE_KEY, JSON.stringify(ops))
    else sessionStorage.removeItem(QUEUE_KEY)
  } catch {
    // Storage blocked: queued changes are lost; the session page offers a manual sync.
  }
}

export function hasQueuedCalendarOps(): boolean {
  return readQueue().length > 0
}

async function runOp(token: string, op: CalendarOp, load: (id: string) => Promise<LiveSession | null>) {
  if (op.kind === 'delete') return deleteEvent(token, op.eventId)
  if (op.kind === 'sync_series') return syncSeriesEvent(token, op.seriesId, op.url)
  const session = await load(op.sessionId)
  // Cancelled in the meantime: nothing to sync.
  if (session) await syncEvent(token, session, op.url)
}

export type CalendarResult = 'done' | 'redirecting'

/**
 * Runs calendar changes now if there's a Google token, otherwise queues them
 * and sends the organizer to Google (resolves 'redirecting' as the page leaves).
 * `returnTo` is where they come back to; that page runs useCalendarQueue().
 */
export async function runCalendarOps(
  ops: CalendarOp[],
  options: {
    load: (sessionId: string) => Promise<LiveSession | null>
    returnTo: string
    email: string | undefined
  },
): Promise<CalendarResult> {
  const token = getCalendarToken()
  if (token) {
    try {
      for (const op of ops) await runOp(token, op, options.load)
      return 'done'
    } catch (error) {
      if (!(error instanceof CalendarAuthError)) throw error
      // Expired mid-way: fall through and reconnect (ops are idempotent).
    }
  }
  writeQueue([...readQueue(), ...ops])
  await connectGoogleCalendar(options.returnTo, options.email)
  return 'redirecting'
}

/**
 * After coming back from Google: runs the queued changes. Returns how many ran,
 * or null when there's nothing to do or no token (the queue is kept for later).
 */
export async function flushCalendarQueue(load: (sessionId: string) => Promise<LiveSession | null>) {
  const ops = readQueue()
  const token = getCalendarToken()
  if (ops.length === 0 || !token) return null
  writeQueue([])
  const failed: CalendarOp[] = []
  let firstError: unknown
  for (const op of ops) {
    try {
      await runOp(token, op, load)
    } catch (error) {
      failed.push(op)
      firstError ??= error
    }
  }
  writeQueue(failed)
  if (firstError) throw firstError instanceof CalendarAuthError ? new DataError('Google Calendar sign-in expired. Try again.') : firstError
  return ops.length
}
