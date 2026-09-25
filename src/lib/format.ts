const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' })
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['week', 7 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/** "3 days ago", "yesterday", "just now". `now` is passed in to keep render pure. */
export function timeAgo(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return relative.format(Math.round(diff / ms), unit)
  }
  return 'just now'
}

export function formatDate(iso: string): string {
  return shortDate.format(parseDate(iso))
}

const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/** A date-only value ("2026-09-25") as a local date; other ISO strings as-is. */
function parseDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
}

/** "Sep 24": compact dates for dense lists. Date-only values aren't shifted by time zone. */
export function formatShortDate(iso: string): string {
  return monthDay.format(parseDate(iso))
}

/** Local calendar date as "YYYY-MM-DD" (what `date` columns store). */
export function localDateISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
