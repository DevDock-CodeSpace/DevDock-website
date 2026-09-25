import { connectGoogleCalendar } from '@/features/auth/api'
import { clearCalendarToken, getCalendarToken } from '@/features/auth/google-calendar'
import { DataError } from '@/lib/errors'
import { fetchInvitees, setCalendarEventId, type LiveSession } from './api'

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

function eventBody(session: LiveSession, invitees: string[], url: string) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
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
    if (response.ok) return
    // Deleted in Google Calendar: make a new one below.
    if (response.status !== 404 && response.status !== 410) throw await googleError(response)
  }
  const response = await calendarFetch(token, '?sendUpdates=all', { method: 'POST', body })
  if (!response.ok) throw await googleError(response)
  const event = (await response.json()) as { id: string }
  await setCalendarEventId(session.id, event.id)
}

async function deleteEvent(token: string, eventId: string): Promise<void> {
  const response = await calendarFetch(token, `/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: 'DELETE' })
  // Already gone is fine.
  if (!response.ok && response.status !== 404 && response.status !== 410) throw await googleError(response)
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
