// The inactivity clock on its own (src/lib/inactivity.ts): no browser, no React,
// no network. Time is a number the test moves, so "the laptop slept for half an
// hour and no timer fired" is just a jump followed by one check.
//
//   npm run test:idle

import {
  ACTIVITY_KEY,
  activityExpired,
  createActivityStore,
  createInactivityWatch,
  holdActivity,
  inactivityExpiredNow,
  markIdleSignOut,
  readLastActivity,
  startActivityClock,
  wasIdleSignOut,
  type ActivityStore,
} from '../src/lib/inactivity.ts'

const MIN = 60_000
const LIMIT = 15 * MIN
const WARNING = 1 * MIN
const START = 1_800_000_000_000

function assertEquals<T>(actual: T, expected: T, message = '') {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${message ? `${message}: ` : ''}expected ${e}, got ${a}`)
}

/** A localStorage stand-in that several "tabs" can share. */
function fakeStorage() {
  const items = new Map<string, string>()
  let writes = 0
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes++
      items.set(key, value)
    },
    removeItem: (key: string) => void items.delete(key),
    writes: () => writes,
  }
}

/** Lets the sign-out (started in a microtask) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function tab(storage: ReturnType<typeof fakeStorage>, clock: { now: number }, signOut: () => Promise<void> = () => Promise.resolve()) {
  const events: string[] = []
  const store: ActivityStore = createActivityStore(storage)
  const watch = createInactivityWatch({
    limitMs: LIMIT,
    warningMs: WARNING,
    now: () => clock.now,
    store,
    onWarn: (deadline) => events.push(`warn:${(deadline - START) / MIN}`),
    onActive: () => events.push('active'),
    onExpire: () => {
      events.push('signOut')
      return signOut()
    },
  })
  return { watch, events, store }
}

Deno.test('sleep: 30 minutes pass with no timer firing, then one check signs out without a warning', async () => {
  const clock = { now: START }
  const { watch, events } = tab(fakeStorage(), clock)
  assertEquals(watch.check(), 'active')
  clock.now += 30 * MIN // lid closed: nothing ran in between
  assertEquals(watch.check(), 'expired', 'the visibilitychange check on waking')
  await settle()
  assertEquals(events, ['signOut'])
  watch.stop()
})

Deno.test('the first input after a long sleep does not rescue the session', async () => {
  const clock = { now: START }
  const { watch, events } = tab(fakeStorage(), clock)
  clock.now += 16 * MIN
  watch.activity() // a mouse move arrives before any check
  assertEquals(watch.phase(), 'expired')
  await settle()
  assertEquals(events, ['signOut'])
  watch.stop()
})

Deno.test('activity resets the countdown', async () => {
  const clock = { now: START }
  const { watch, events } = tab(fakeStorage(), clock)
  for (let i = 0; i < 6; i++) {
    clock.now += 10 * MIN // an hour in all, never 15 minutes without input
    watch.activity()
    assertEquals(watch.check(), 'active')
  }
  await settle()
  assertEquals(events, [])
  clock.now += 15 * MIN
  assertEquals(watch.check(), 'expired')
  watch.stop()
})

Deno.test('the warning shows at the 14-minute mark and "Stay signed in" resets it', async () => {
  const clock = { now: START }
  const { watch, events, store } = tab(fakeStorage(), clock)
  clock.now = START + 14 * MIN - 1
  assertEquals(watch.check(), 'active', 'just before the mark')
  clock.now = START + 14 * MIN
  assertEquals(watch.check(), 'warning')
  assertEquals(watch.check(), 'warning', 'a second check does not warn twice')
  assertEquals(events, ['warn:15'])

  clock.now += 30_000
  watch.activity(true) // the button
  assertEquals(watch.phase(), 'active')
  assertEquals(events, ['warn:15', 'active'])
  assertEquals(readLastActivity(store), clock.now, 'written at once, for the other tabs')

  clock.now += 14 * MIN - 1
  assertEquals(watch.check(), 'active', 'a full new countdown')
  clock.now += 1
  assertEquals(watch.check(), 'warning')
  clock.now += WARNING
  assertEquals(watch.check(), 'expired')
  await settle()
  assertEquals(events, ['warn:15', 'active', 'warn:29.5', 'signOut'])
  watch.stop()
})

Deno.test('activity in another tab (the storage event) prevents the sign-out and ends the warning', async () => {
  const storage = fakeStorage()
  const clock = { now: START }
  const hidden = tab(storage, clock)
  const used = tab(storage, clock)

  clock.now += 14 * MIN + 30_000
  assertEquals(hidden.watch.check(), 'warning')
  used.watch.activity(true) // typing in the other tab; its write arrives here as a storage event
  assertEquals(hidden.watch.check(), 'active')

  clock.now += 10 * MIN // 24.5 minutes since this tab's own last input
  used.watch.activity()
  clock.now += 10 * MIN
  assertEquals(hidden.watch.check(), 'active')
  await settle()
  assertEquals(hidden.events, ['warn:15', 'active'])
  hidden.watch.stop()
  used.watch.stop()
})

Deno.test('sign-out is called once however many checks follow, and again only after it failed', async () => {
  const clock = { now: START }
  let calls = 0
  let fail = true
  const { watch } = tab(fakeStorage(), clock, () => {
    calls++
    return fail ? Promise.reject(new Error('offline')) : Promise.resolve()
  })
  clock.now += 20 * MIN
  watch.check() // interval
  watch.check() // visibilitychange
  watch.check() // focus
  watch.activity()
  await settle()
  assertEquals(calls, 1, 'one call for a burst of triggers')

  watch.activity(true)
  assertEquals(watch.phase(), 'expired', 'input does not undo an expiry')
  fail = false
  watch.check() // the next interval tries again
  await settle()
  assertEquals(calls, 2)
  watch.check()
  watch.check()
  await settle()
  assertEquals(calls, 2, 'and not again once it worked')
  watch.stop()
})

Deno.test('writes to storage are throttled to one per five seconds', () => {
  const storage = fakeStorage()
  const clock = { now: START }
  const { watch } = tab(storage, clock)
  const before = storage.writes()
  for (let i = 0; i < 100; i++) {
    clock.now += 100 // ten seconds of mouse movement
    watch.activity()
  }
  assertEquals(storage.writes() - before, 2)
  watch.stop()
})

Deno.test('something holding the clock (a call) counts as activity', async () => {
  const clock = { now: START }
  const { watch, events } = tab(fakeStorage(), clock)
  const release = holdActivity()
  for (let i = 0; i < 120; i++) {
    clock.now += 30_000 // an hour-long call, checked every 30 s, no input at all
    assertEquals(watch.check(), 'active')
  }
  release()
  release() // releasing twice is harmless
  clock.now += 14 * MIN
  assertEquals(watch.check(), 'warning', 'the countdown starts when the call ends')
  await settle()
  assertEquals(events, ['warn:75'])
  watch.stop()
})

Deno.test('a clock cleared by another tab signing out is not treated as inactivity', async () => {
  const storage = fakeStorage()
  const clock = { now: START }
  const { watch, events } = tab(storage, clock)
  clock.now += 20 * MIN
  storage.removeItem(ACTIVITY_KEY) // the other tab signed out by hand
  assertEquals(watch.check(), 'active')
  await settle()
  assertEquals(events, [])
  watch.stop()
})

Deno.test('a stored timestamp put back by hand (rehearsing sleep in devtools) is believed', async () => {
  const storage = fakeStorage()
  const clock = { now: START }
  const { watch, events } = tab(storage, clock)
  clock.now += 2 * MIN
  watch.activity(true) // this tab was used a moment ago
  storage.setItem(ACTIVITY_KEY, String(clock.now - 30 * MIN))
  watch.activity() // moving the mouse right after must not undo it
  assertEquals(watch.check(), 'expired')
  await settle()
  assertEquals(events, ['signOut'])
  watch.stop()
})

Deno.test('the running watch answers inactivityExpiredNow (asked before live updates refetch)', async () => {
  const clock = { now: START }
  assertEquals(inactivityExpiredNow(), false, 'no watch: nothing to say')
  const { watch, events } = tab(fakeStorage(), clock)
  assertEquals(inactivityExpiredNow(), false)
  clock.now += 15 * MIN
  assertEquals(inactivityExpiredNow(), true)
  await settle()
  assertEquals(events, ['signOut'])
  watch.stop()
  assertEquals(inactivityExpiredNow(), false)
})

Deno.test('page load: an old timestamp is expired, a missing one is not, and signing in starts afresh', () => {
  const store = createActivityStore(fakeStorage())
  assertEquals(activityExpired(LIMIT, START, store), false, 'no record')
  startActivityClock(START, store)
  assertEquals(activityExpired(LIMIT, START + LIMIT - 1, store), false)
  assertEquals(activityExpired(LIMIT, START + LIMIT, store), true)
  markIdleSignOut(store)
  assertEquals(wasIdleSignOut(store), true)
  startActivityClock(START + 8 * 60 * MIN, store) // signed in the next morning
  assertEquals(activityExpired(LIMIT, START + 8 * 60 * MIN + 1, store), false)
  assertEquals(wasIdleSignOut(store), false)
})

Deno.test('storage that is missing or throws falls back to memory', async () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
    removeItem: () => {
      throw new Error('blocked')
    },
  }
  for (const storage of [broken, null, undefined]) {
    const clock = { now: START }
    const store = createActivityStore(storage)
    const events: string[] = []
    const watch = createInactivityWatch({
      limitMs: LIMIT,
      warningMs: WARNING,
      now: () => clock.now,
      store,
      onWarn: () => events.push('warn'),
      onActive: () => events.push('active'),
      onExpire: () => void events.push('signOut'),
    })
    clock.now += 10 * MIN
    watch.activity()
    clock.now += 10 * MIN
    assertEquals(watch.check(), 'active')
    clock.now += 5 * MIN
    assertEquals(watch.check(), 'expired')
    await settle()
    assertEquals(events, ['signOut'])
    watch.stop()
  }
})
