// Where the Supabase sign-in session is kept, and how long it may last. Decided
// entirely in the browser: Supabase's own session limits need the Pro plan.
//
//   - Default: sessionStorage. The session belongs to this tab and ends when the
//     tab closes; a new tab signs in on its own.
//   - "Remember me" (ticked on the login page): localStorage, shared by the
//     browser's tabs and kept across restarts.
//
// Either way a session lasts at most SESSION_LIMIT_MS (4 h) from sign-in, or
// REMEMBERED_SESSION_LIMIT_MS (12 h) when remembered, and the inactivity
// sign-out (lib/inactivity) still applies. The refresh token itself stays valid on
// Supabase's side; the browser drops it.
//
// No imports and no browser globals at module level: the Deno tests load this file
// as it is (tests/auth-storage.test.ts).

/** "1" when the person ticked "Remember me" at their last sign-in. Always in localStorage. */
export const REMEMBER_KEY = 'devdock:rememberMe'
/** When this session signed in. Kept beside the session, so it is per tab unless remembered. */
export const SIGNED_IN_AT_KEY = 'devdock:signedInAt'

export const SESSION_LIMIT_MS = 4 * 60 * 60 * 1000
export const REMEMBERED_SESSION_LIMIT_MS = 12 * 60 * 60 * 1000

type WebStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type AuthStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  remembered: () => boolean
  setRemembered: (value: boolean) => void
}

export function createAuthStorage(local: WebStore | null | undefined, session: WebStore | null | undefined): AuthStorage {
  // Used only once storage has failed (blocked, full, private mode): the session
  // then lasts as long as this page. Never read while storage works, so a value
  // another tab removed can't come back from here.
  const memory = new Map<string, string>()
  let failed = !local && !session
  const attempt = <T>(work: () => T): T | undefined => {
    try {
      return work()
    } catch {
      failed = true
      return undefined
    }
  }
  const remembered = () => attempt(() => local?.getItem(REMEMBER_KEY)) === '1'

  return {
    remembered,
    setRemembered(value) {
      attempt(() => (value ? local?.setItem(REMEMBER_KEY, '1') : local?.removeItem(REMEMBER_KEY)))
    },
    getItem(key) {
      if (failed) return memory.get(key) ?? null
      const inTab = attempt(() => session?.getItem(key)) ?? null
      if (inTab !== null) return inTab
      if (remembered()) return attempt(() => local?.getItem(key)) ?? null
      // Not remembered: nothing of the session belongs on disk. A token found there
      // was left by an older version of the app, which kept every session in localStorage.
      attempt(() => local?.removeItem(key))
      return null
    },
    setItem(key, value) {
      memory.set(key, value)
      if (remembered()) {
        attempt(() => local?.setItem(key, value))
        attempt(() => session?.removeItem(key))
      } else {
        attempt(() => session?.setItem(key, value))
        attempt(() => local?.removeItem(key))
      }
    },
    removeItem(key) {
      memory.delete(key)
      attempt(() => session?.removeItem(key))
      attempt(() => local?.removeItem(key))
    },
  }
}

let shared: AuthStorage | undefined

/** The browser's auth storage, made on first use (so importing this file touches nothing). */
export function authStorage(): AuthStorage {
  if (!shared) {
    const get = (name: 'localStorage' | 'sessionStorage') => {
      try {
        return typeof globalThis[name] === 'undefined' ? null : globalThis[name]
      } catch {
        return null
      }
    }
    shared = createAuthStorage(get('localStorage'), get('sessionStorage'))
  }
  return shared
}

// --- how long a session may last ----------------------------------------------

export function startSessionClock(store: AuthStorage = authStorage(), now: number = Date.now()) {
  store.setItem(SIGNED_IN_AT_KEY, String(now))
}

export function clearSessionClock(store: AuthStorage = authStorage()) {
  store.removeItem(SIGNED_IN_AT_KEY)
}

export function sessionStartedAt(store: AuthStorage = authStorage()): number | null {
  const value = Number(store.getItem(SIGNED_IN_AT_KEY))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** A session signed in before this existed has no start: it starts now, rather than ending at once. */
export function ensureSessionClock(store: AuthStorage = authStorage(), now: number = Date.now()) {
  if (sessionStartedAt(store) === null) startSessionClock(store, now)
}

export function sessionLimitMs(store: AuthStorage = authStorage()): number {
  return store.remembered() ? REMEMBERED_SESSION_LIMIT_MS : SESSION_LIMIT_MS
}

/** True once the session is older than its limit. No start recorded means nothing to judge by. */
export function sessionExpired(store: AuthStorage = authStorage(), now: number = Date.now()): boolean {
  const started = sessionStartedAt(store)
  return started !== null && now - started >= sessionLimitMs(store)
}
