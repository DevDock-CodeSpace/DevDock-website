// Signing out after a period without input, decided entirely in the browser:
// nothing here makes a request or is stored on a server.
//
// The decision is always "now minus the last activity", never a long timer:
// timers stop while a laptop sleeps and are throttled in hidden tabs, so they are
// only used to *ask* the question again. The last activity is kept in localStorage,
// which makes it one clock for all of a person's tabs and lets a tab that wakes up
// hours later see how long it has really been.
//
// No imports and no browser globals at module level: the Deno tests load this file
// as it is (tests/inactivity.test.ts).

export const ACTIVITY_KEY = 'devdock:lastActivityAt'
/** Set by the tab that signs out for inactivity, so the others can say why they are on the login page. */
export const IDLE_SIGN_OUT_KEY = 'devdock:signedOutForInactivity'

export type ActivityStore = {
  get: (key: string) => string | null
  set: (key: string, value: string) => void
  remove: (key: string) => void
}

/** A store over `storage`, falling back to memory (this tab only) when it is missing or blocked. */
export function createActivityStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined): ActivityStore {
  const memory = new Map<string, string>()
  // Once the storage has failed, this tab keeps to its own copy: mixing the two
  // would bring back a value another tab removed.
  let working = Boolean(storage)
  return {
    get(key) {
      if (working && storage) {
        try {
          return storage.getItem(key)
        } catch {
          working = false
        }
      }
      return memory.get(key) ?? null
    },
    set(key, value) {
      memory.set(key, value)
      if (!working || !storage) return
      try {
        storage.setItem(key, value)
      } catch {
        working = false
      }
    },
    remove(key) {
      memory.delete(key)
      if (!working || !storage) return
      try {
        storage.removeItem(key)
      } catch {
        working = false
      }
    },
  }
}

let shared: ActivityStore | undefined

/** The browser's store, made on first use (so importing this file touches nothing). */
export function activityStore(): ActivityStore {
  if (!shared) {
    let storage: Storage | null = null
    try {
      storage = typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      storage = null
    }
    shared = createActivityStore(storage)
  }
  return shared
}

export function readLastActivity(store: ActivityStore = activityStore()): number | null {
  const value = Number(store.get(ACTIVITY_KEY))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Starts the clock again: called when someone signs in, so an old timestamp can't sign them straight back out. */
export function startActivityClock(now: number = Date.now(), store: ActivityStore = activityStore()) {
  store.set(ACTIVITY_KEY, String(now))
  store.remove(IDLE_SIGN_OUT_KEY)
}

export function clearActivityClock(store: ActivityStore = activityStore()) {
  store.remove(ACTIVITY_KEY)
}

/** True when the last recorded activity is at least `limitMs` old. No record means nothing to judge by. */
export function activityExpired(limitMs: number, now: number = Date.now(), store: ActivityStore = activityStore()): boolean {
  const last = readLastActivity(store)
  return last !== null && now - last >= limitMs
}

export function markIdleSignOut(store: ActivityStore = activityStore()) {
  store.set(IDLE_SIGN_OUT_KEY, '1')
}

export function wasIdleSignOut(store: ActivityStore = activityStore()): boolean {
  return store.get(IDLE_SIGN_OUT_KEY) === '1'
}

// --- things that count as activity without any input --------------------------
// A call plays in a cross-origin frame: its clicks and keys never reach this page,
// and nobody touches anything while they listen. While something holds the clock,
// every check counts as activity.
let holds = 0

export function holdActivity(): () => void {
  holds++
  let released = false
  return () => {
    if (released) return
    released = true
    holds--
  }
}

// --- the watch currently running in this tab ---------------------------------
let current: InactivityWatch | null = null

/**
 * Asks the running watch to look at the clock now. True when the limit has passed
 * (the sign-out has then started): callers about to load data, such as live
 * updates reconnecting after sleep, should not.
 */
export function inactivityExpiredNow(): boolean {
  return current ? current.check() === 'expired' : false
}

export type InactivityPhase = 'active' | 'warning' | 'expired'

export type InactivityWatch = {
  /** Input happened in this tab. `force` skips the throttle (the "Stay signed in" button). */
  activity: (force?: boolean) => void
  /** Compares the clock with the last activity and reports where things stand. */
  check: () => InactivityPhase
  phase: () => InactivityPhase
  stop: () => void
}

export type InactivityOptions = {
  limitMs: number
  /** How long before the limit the warning shows. */
  warningMs: number
  /** The warning is due: `deadline` is when the sign-out happens. */
  onWarn: (deadline: number) => void
  /** Activity (here or in another tab) ended the warning. */
  onActive: () => void
  /** The limit has passed. Called once; again on a later check only if it rejected (offline, say). */
  onExpire: () => Promise<void> | void
  now?: () => number
  store?: ActivityStore
  /** At most one write to the store per this long. */
  writeEveryMs?: number
  /** Input closer together than this is counted once. */
  sampleMs?: number
}

export const ACTIVITY_WRITE_MS = 5000
const ACTIVITY_SAMPLE_MS = 1000

export function createInactivityWatch(options: InactivityOptions): InactivityWatch {
  const { limitMs, warningMs, onWarn, onActive, onExpire } = options
  const now = options.now ?? Date.now
  const store = options.store ?? activityStore()
  const writeEveryMs = options.writeEveryMs ?? ACTIVITY_WRITE_MS
  const sampleMs = options.sampleMs ?? ACTIVITY_SAMPLE_MS

  let phase: InactivityPhase = 'active'
  let signingOut = false
  let stopped = false
  // This tab's own latest activity; the store may be up to `writeEveryMs` behind it.
  let seen = readLastActivity(store) ?? 0
  let written = seen
  if (seen === 0) record(now())

  function record(at: number) {
    seen = at
    written = at
    store.set(ACTIVITY_KEY, String(at))
  }

  /** The most recent activity in any tab. */
  function latest() {
    const stored = readLastActivity(store) ?? 0
    // The stored clock is older than this tab's last write: it was put back (by hand
    // in devtools, to rehearse a long sleep). Take it, so the rehearsal behaves like the real thing.
    if (stored > 0 && stored < written) {
      seen = stored
      written = stored
    }
    return Math.max(seen, stored)
  }

  function expire() {
    phase = 'expired'
    if (signingOut) return
    signingOut = true
    // A failed sign-out (no network on waking) is tried again by the next check.
    Promise.resolve()
      .then(onExpire)
      .catch(() => {
        signingOut = false
      })
  }

  function check(): InactivityPhase {
    if (stopped) return phase
    // Once the limit has passed nothing revives the session: only the sign-out is retried.
    if (phase === 'expired') {
      expire()
      return phase
    }
    // The clock was cleared: another tab signed out. Sessions can belong to one tab
    // (lib/auth-storage), so that sign-out doesn't necessarily reach this one.
    if (readLastActivity(store) === null) {
      // For inactivity: the person has been away from every tab, this one included. Follow.
      if (wasIdleSignOut(store)) {
        expire()
        return phase
      }
      // By hand: that wasn't inactivity here. This tab's countdown starts again from now.
      record(now())
    }
    const at = now()
    if (holds > 0) record(at)
    const elapsed = at - latest()
    if (elapsed >= limitMs) {
      expire()
    } else if (elapsed >= limitMs - warningMs) {
      if (phase !== 'warning') {
        phase = 'warning'
        onWarn(latest() + limitMs)
      }
    } else if (phase === 'warning') {
      phase = 'active'
      onActive()
    }
    return phase
  }

  function activity(force = false) {
    if (stopped || phase === 'expired') return
    const at = now()
    const last = latest()
    if (!force && phase === 'active' && at - seen < sampleMs) return
    // The first input after a long sleep must not rescue a session that has already run out.
    if (at - last >= limitMs) {
      expire()
      return
    }
    seen = at
    const warned = phase === 'warning'
    // Ending a warning is written at once, so the other tabs drop theirs too.
    if (force || warned || at - written >= writeEveryMs) record(at)
    if (warned) {
      phase = 'active'
      onActive()
    }
  }

  const watch: InactivityWatch = {
    activity,
    check,
    phase: () => phase,
    stop() {
      stopped = true
      if (current === watch) current = null
    },
  }
  current = watch
  return watch
}
