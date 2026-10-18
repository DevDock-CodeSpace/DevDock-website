// Times of day for the time field: values are "HH:MM" (24-hour, local), shown as 12-hour time
// plus an AM/PM switch. No imports, so `npm run test:reminders` (Deno) tests it directly.

export type Period = 'AM' | 'PM'

const pad = (n: number) => String(n).padStart(2, '0')
const toValue = (h24: number, m: number) => `${pad(h24)}:${pad(m)}`

/** "14:05" → { text: "2:05", period: "PM" }. */
export function splitTime(value: string): { text: string; period: Period } {
  const [h, m] = value.split(':').map(Number)
  const hour = Number.isFinite(h) ? h : 9
  const minute = Number.isFinite(m) ? m : 0
  return { text: `${hour % 12 === 0 ? 12 : hour % 12}:${pad(minute)}`, period: hour < 12 ? 'AM' : 'PM' }
}

/** A 12-hour hour (1–12) and minute in a period → "HH:MM". */
export function joinTime(hour12: number, minute: number, period: Period): string {
  return toValue((hour12 % 12) + (period === 'PM' ? 12 : 0), minute)
}

/** The same time of day in the other half of the day ("09:30" → "21:30"). */
export function withPeriod(value: string, period: Period): string {
  const [h, m] = value.split(':').map(Number)
  return toValue((h % 12) + (period === 'PM' ? 12 : 0), m)
}

/**
 * What someone typed → "HH:MM", or null if it isn't a time. Accepts "9", "9:05",
 * "9.05", "905", "0905", "1430", "14:30", and an "am"/"pm"/"a"/"p" suffix. Hours 1–12 use the
 * suffix or else `period`; 0 and 13–23 are read as 24-hour time.
 */
export function parseTimeInput(text: string, period: Period): string | null {
  const match = text.trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{1,4})(?:[:.](\d{2}))?(a|am|p|pm)?$/)
  if (!match) return null
  let [, digits, minutes, suffix] = match
  if (minutes === undefined && digits.length > 2) {
    minutes = digits.slice(-2)
    digits = digits.slice(0, -2)
  }
  if (digits.length > 2) return null
  const hour = Number(digits)
  const minute = minutes === undefined ? 0 : Number(minutes)
  if (minute > 59 || hour > 23) return null
  if (suffix) {
    if (hour < 1 || hour > 12) return null
    return joinTime(hour, minute, suffix.startsWith('p') ? 'PM' : 'AM')
  }
  if (hour === 0 || hour > 12) return toValue(hour, minute)
  return joinTime(hour, minute, period)
}

/** "HH:MM" every `step` minutes within one half of the day, starting at 12:00. */
export function timesInPeriod(period: Period, step = 30): string[] {
  const start = period === 'AM' ? 0 : 12 * 60
  return Array.from({ length: (12 * 60) / step }, (_, i) => {
    const minutes = start + i * step
    return toValue(Math.floor(minutes / 60), minutes % 60)
  })
}
