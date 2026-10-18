// How long someone may be away before they are signed out (lib/inactivity). The
// owner asked for it to cut the requests idle tabs make: every one is a log line.

const DEFAULT_LIMIT_MINUTES = 15

/** VITE_INACTIVITY_LIMIT_MINUTES overrides the default (a build-time setting; 1 is handy for testing). */
function limitMinutes(): number {
  const value = Number(import.meta.env.VITE_INACTIVITY_LIMIT_MINUTES)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LIMIT_MINUTES
}

export const INACTIVITY_LIMIT_MS = limitMinutes() * 60 * 1000

/** The "still there?" dialog shows this long before the sign-out (less when the limit itself is short). */
export const WARNING_MS = Math.min(120 * 1000, INACTIVITY_LIMIT_MS / 2)

/** The clock is looked at this often; the interval only asks, the timestamps decide. */
export const INACTIVITY_CHECK_MS = 30 * 1000

/** A tab hidden for this long stops listening for live updates until it is looked at again (hooks/use-realtime-sync). */
export const REALTIME_PAUSE_AFTER_HIDDEN_MS = 5 * 60 * 1000

/** On the login page after an inactivity sign-out: /login?reason=inactive. */
export const INACTIVE_REASON = 'inactive'
