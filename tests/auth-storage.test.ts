// Where the sign-in session is kept and how long it lasts (src/lib/auth-storage.ts):
// no browser, no Supabase. Two Maps stand in for localStorage (shared by tabs) and
// sessionStorage (one per tab).
//
//   npm run test:idle

import {
  createAuthStorage,
  ensureSessionClock,
  REMEMBER_KEY,
  REMEMBERED_SESSION_LIMIT_MS,
  sessionExpired,
  sessionStartedAt,
  SESSION_LIMIT_MS,
  SIGNED_IN_AT_KEY,
  startSessionClock,
  clearSessionClock,
} from '../src/lib/auth-storage.ts'

const TOKEN = 'sb-test-auth-token'
const START = 1_800_000_000_000
const HOUR = 60 * 60 * 1000

function assertEquals<T>(actual: T, expected: T, message = '') {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${message ? `${message}: ` : ''}expected ${e}, got ${a}`)
}

function fakeStorage(options: { broken?: boolean } = {}) {
  const items = new Map<string, string>()
  const guard = () => {
    if (options.broken) throw new Error('SecurityError')
  }
  return {
    getItem: (key: string) => (guard(), items.get(key) ?? null),
    setItem: (key: string, value: string) => (guard(), void items.set(key, value)),
    removeItem: (key: string) => (guard(), void items.delete(key)),
    items,
  }
}

Deno.test('without "Remember me" the session is kept in this tab only', () => {
  const local = fakeStorage()
  const tabA = createAuthStorage(local, fakeStorage())
  const tabB = createAuthStorage(local, fakeStorage())
  tabA.setRemembered(false)
  tabA.setItem(TOKEN, 'session-a')
  assertEquals(tabA.getItem(TOKEN), 'session-a')
  assertEquals(local.items.has(TOKEN), false, 'nothing on disk')
  assertEquals(tabB.getItem(TOKEN), null, 'another tab signs in on its own')
})

Deno.test('with "Remember me" the session is shared by every tab and survives a restart', () => {
  const local = fakeStorage()
  const tabA = createAuthStorage(local, fakeStorage())
  tabA.setRemembered(true)
  tabA.setItem(TOKEN, 'session-a')
  assertEquals(local.items.get(TOKEN), 'session-a')
  assertEquals(local.items.get(REMEMBER_KEY), '1')
  const afterRestart = createAuthStorage(local, fakeStorage())
  assertEquals(afterRestart.getItem(TOKEN), 'session-a')
})

Deno.test('signing out removes the session wherever it is', () => {
  const local = fakeStorage()
  const session = fakeStorage()
  const store = createAuthStorage(local, session)
  store.setRemembered(true)
  store.setItem(TOKEN, 'x')
  store.removeItem(TOKEN)
  assertEquals([local.items.has(TOKEN), session.items.has(TOKEN), store.getItem(TOKEN)], [false, false, null])
})

Deno.test('a token an older version left in localStorage is dropped, not used, when not remembered', () => {
  const local = fakeStorage()
  local.items.set(TOKEN, 'old-session')
  const store = createAuthStorage(local, fakeStorage())
  assertEquals(store.getItem(TOKEN), null)
  assertEquals(local.items.has(TOKEN), false)
})

Deno.test('blocked storage falls back to memory for this page', () => {
  const store = createAuthStorage(fakeStorage({ broken: true }), fakeStorage({ broken: true }))
  store.setItem(TOKEN, 'kept-in-memory')
  assertEquals(store.getItem(TOKEN), 'kept-in-memory')
  store.removeItem(TOKEN)
  assertEquals(store.getItem(TOKEN), null)
})

Deno.test('a session ends 4 hours after sign-in, or 12 hours when remembered', () => {
  const plain = createAuthStorage(fakeStorage(), fakeStorage())
  startSessionClock(plain, START)
  assertEquals(sessionExpired(plain, START + SESSION_LIMIT_MS - 1), false)
  assertEquals(sessionExpired(plain, START + SESSION_LIMIT_MS), true)

  const remembered = createAuthStorage(fakeStorage(), fakeStorage())
  remembered.setRemembered(true)
  startSessionClock(remembered, START)
  assertEquals(sessionExpired(remembered, START + 5 * HOUR), false, 'past 4 h is fine when remembered')
  assertEquals(sessionExpired(remembered, START + 12 * HOUR - 1), false)
  assertEquals(sessionExpired(remembered, START + REMEMBERED_SESSION_LIMIT_MS), true)
  assertEquals(REMEMBERED_SESSION_LIMIT_MS, 12 * HOUR)
})

Deno.test('the sign-in time is kept beside the session: per tab unless remembered', () => {
  const local = fakeStorage()
  const tabA = createAuthStorage(local, fakeStorage())
  startSessionClock(tabA, START)
  assertEquals(local.items.has(SIGNED_IN_AT_KEY), false)
  assertEquals(sessionStartedAt(createAuthStorage(local, fakeStorage())), null, 'another tab has its own')
})

Deno.test('a session from before the limit existed starts its clock now instead of ending at once', () => {
  const store = createAuthStorage(fakeStorage(), fakeStorage())
  assertEquals(sessionExpired(store, START), false, 'no start: nothing to judge by')
  ensureSessionClock(store, START)
  assertEquals(sessionStartedAt(store), START)
  ensureSessionClock(store, START + HOUR)
  assertEquals(sessionStartedAt(store), START, 'an existing start is kept')
  clearSessionClock(store)
  assertEquals(sessionStartedAt(store), null)
})
