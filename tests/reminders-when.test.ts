// Reminder times as people read them (src/features/reminders/when.ts): local calendar days,
// DST, and the dialog's quick times. No browser, no network.
//
//   npm run test:reminders   (pins TZ to America/Chicago, a zone with DST)
import { dayOffset, formatReminderDay, isOverdue, quickTimes } from '../src/features/reminders/when.ts'

function assertEquals<T>(actual: T, expected: T, message = '') {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${message ? message + ': ' : ''}expected ${b}, got ${a}`)
}

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()

Deno.test('day offsets follow the calendar, not 24-hour blocks', () => {
  const lateTonight = local(2026, 10, 18, 23, 30)
  assertEquals(dayOffset(local(2026, 10, 19, 0, 15), lateTonight), 1)
  assertEquals(dayOffset(local(2026, 10, 18, 0, 5), lateTonight), 0)
  assertEquals(dayOffset(local(2026, 10, 17, 23, 59), lateTonight), -1)
})

Deno.test('a DST change does not shift tomorrow', () => {
  // America/Chicago falls back on 2026-11-01 (a 25-hour day) and springs forward on 2027-03-14.
  assertEquals(dayOffset(local(2026, 11, 2, 9), local(2026, 11, 1, 9)), 1)
  assertEquals(dayOffset(local(2027, 3, 15, 9), local(2027, 3, 14, 9)), 1)
})

Deno.test('day labels', () => {
  const now = local(2026, 10, 18, 10) // a Sunday
  const iso = (t: number) => new Date(t).toISOString()
  assertEquals(formatReminderDay(iso(local(2026, 10, 18, 21)), now), 'Today')
  assertEquals(formatReminderDay(iso(local(2026, 10, 19, 9)), now), 'Tomorrow')
  assertEquals(formatReminderDay(iso(local(2026, 10, 17, 9)), now), 'Yesterday')
  assertEquals(formatReminderDay(iso(local(2026, 10, 23, 9)), now), 'Friday')
  assertEquals(formatReminderDay(iso(local(2026, 11, 2, 9)), now), 'Nov 2')
  assertEquals(formatReminderDay(iso(local(2027, 1, 5, 9)), now), 'Jan 5, 2027')
})

Deno.test('overdue means the time has come', () => {
  const now = local(2026, 10, 18, 10)
  assertEquals(isOverdue(new Date(now).toISOString(), now), true)
  assertEquals(isOverdue(new Date(now + 60_000).toISOString(), now), false)
})

Deno.test('quick times', () => {
  const sundayMorning = local(2026, 10, 18, 10, 2)
  const times = quickTimes(sundayMorning)
  // On a Sunday the coming Monday is tomorrow, so it isn't offered twice.
  assertEquals(times.map((t) => t.label), ['In 1 hour', 'This afternoon', 'Tomorrow'])
  assertEquals(times[0].at.getTime(), local(2026, 10, 18, 11, 5))
  assertEquals(times[1].at.getTime(), local(2026, 10, 18, 17))
  assertEquals(times[2].at.getTime(), local(2026, 10, 19, 9))
  const wednesday = quickTimes(local(2026, 10, 21, 10))
  assertEquals(wednesday[3].at.getTime(), local(2026, 10, 26, 9))

  // Late in the day there is no "this afternoon"; on a Monday, next Monday is a week away.
  const mondayEvening = local(2026, 10, 19, 18)
  const later = quickTimes(mondayEvening)
  assertEquals(later.map((t) => t.label), ['In 1 hour', 'Tomorrow', 'Next Monday'])
  assertEquals(later[2].at.getTime(), local(2026, 10, 26, 9))
})
