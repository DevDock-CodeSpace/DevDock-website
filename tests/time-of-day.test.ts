// The time field's parsing (src/features/live/timeOfDay.ts): what people type, 12-hour display,
// and the AM/PM switch. No browser.
//
//   npm run test:reminders
import { joinTime, parseTimeInput, splitTime, timesInPeriod, withPeriod } from '../src/features/live/timeOfDay.ts'

function assertEquals<T>(actual: T, expected: T, message = '') {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${message ? message + ': ' : ''}expected ${b}, got ${a}`)
}

Deno.test('typed times use the AM/PM in view', () => {
  for (const [typed, am, pm] of [
    ['9', '09:00', '21:00'],
    ['9:05', '09:05', '21:05'],
    ['9.05', '09:05', '21:05'],
    ['905', '09:05', '21:05'],
    ['0905', '09:05', '21:05'],
    ['12', '00:00', '12:00'],
    ['12:30', '00:30', '12:30'],
    [' 7:45 ', '07:45', '19:45'],
  ]) {
    assertEquals(parseTimeInput(typed, 'AM'), am, typed)
    assertEquals(parseTimeInput(typed, 'PM'), pm, typed)
  }
})

Deno.test('24-hour times and suffixes override it', () => {
  assertEquals(parseTimeInput('14:30', 'AM'), '14:30')
  assertEquals(parseTimeInput('1430', 'AM'), '14:30')
  assertEquals(parseTimeInput('0:15', 'PM'), '00:15')
  assertEquals(parseTimeInput('7pm', 'AM'), '19:00')
  assertEquals(parseTimeInput('7:15 PM', 'AM'), '19:15')
  assertEquals(parseTimeInput('12am', 'PM'), '00:00')
  assertEquals(parseTimeInput('11 a', 'PM'), '11:00')
})

Deno.test('nonsense is refused', () => {
  for (const typed of ['', 'abc', '25', '9:60', '9:5', '12345', '13pm', '0am', '9::00']) {
    assertEquals(parseTimeInput(typed, 'AM'), null, typed)
  }
})

Deno.test('display and the AM/PM switch', () => {
  assertEquals(splitTime('00:00'), { text: '12:00', period: 'AM' })
  assertEquals(splitTime('12:05'), { text: '12:05', period: 'PM' })
  assertEquals(splitTime('21:40'), { text: '9:40', period: 'PM' })
  assertEquals(withPeriod('09:30', 'PM'), '21:30')
  assertEquals(withPeriod('21:30', 'AM'), '09:30')
  assertEquals(withPeriod('12:00', 'AM'), '00:00')
  assertEquals(joinTime(12, 0, 'PM'), '12:00')
})

Deno.test('the list is one half of the day', () => {
  const am = timesInPeriod('AM')
  assertEquals(am.length, 24)
  assertEquals([am[0], am[1], am[23]], ['00:00', '00:30', '11:30'])
  const pm = timesInPeriod('PM')
  assertEquals([pm[0], pm[23]], ['12:00', '23:30'])
})
