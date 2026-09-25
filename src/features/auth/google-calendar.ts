import type { Session } from '@supabase/supabase-js'

// Google Calendar access for organizers. The token is the Google access token
// Supabase hands back (session.provider_token) right after a sign-in that asked
// for the calendar scope. It lasts about an hour and isn't refreshed (there's
// no server to hold a refresh token), so it lives in sessionStorage for this tab
// and the organizer reconnects when it expires; Google skips the consent screen
// once the scope has been granted.

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

const TOKEN_KEY = 'devdock:google-calendar'
const CONNECTING_KEY = 'devdock:google-calendar-connecting'
/** Google access tokens last 3600 s; stop using one a little early. */
const TOKEN_LIFETIME_MS = 55 * 60_000

type StoredToken = { token: string; expiresAt: number }

export function getCalendarToken(): string | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as Partial<StoredToken>
    if (typeof stored.token !== 'string' || typeof stored.expiresAt !== 'number') return null
    if (Date.now() >= stored.expiresAt) {
      sessionStorage.removeItem(TOKEN_KEY)
      return null
    }
    return stored.token
  } catch {
    return null
  }
}

export function clearCalendarToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(CONNECTING_KEY)
  } catch {
    // Storage blocked: nothing was stored.
  }
}

/** Called just before redirecting to Google for the calendar scope. */
export function markCalendarConnecting() {
  try {
    sessionStorage.setItem(CONNECTING_KEY, '1')
  } catch {
    // Storage blocked: the token can't be kept anyway.
  }
}

/**
 * On the OAuth callback: keep the Google token only when this sign-in asked
 * for the calendar scope (a plain sign-in's token can't use the Calendar API).
 */
export function captureCalendarToken(session: Session) {
  try {
    const connecting = sessionStorage.getItem(CONNECTING_KEY) === '1'
    sessionStorage.removeItem(CONNECTING_KEY)
    if (!connecting || !session.provider_token) return
    const stored: StoredToken = { token: session.provider_token, expiresAt: Date.now() + TOKEN_LIFETIME_MS }
    sessionStorage.setItem(TOKEN_KEY, JSON.stringify(stored))
  } catch {
    // Storage blocked: calendar sync asks to connect again.
  }
}
