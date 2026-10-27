// Cell text → DevDock values: statuses and priorities as Linear, Jira and Notion name them,
// dates in the formats they export, estimates, labels and people. A value it can't read gives
// null, and the page asks (statuses, priorities, people, sprints) or leaves it empty.
// No imports: Deno tests run it as is (npm run test:import).

/** Same values as the database enum (api.ts IssueStatus). */
export type Status = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled'
export type Priority = 0 | 1 | 2 | 3 | 4

const key = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, ' ')

const STATUS_WORDS: Record<Status, string[]> = {
  backlog: ['backlog', 'icebox', 'triage', 'someday', 'later', 'idea', 'ideas'],
  todo: ['todo', 'to do', 'open', 'new', 'not started', 'planned', 'ready', 'selected for development', 'unstarted', 'reopened'],
  in_progress: ['in progress', 'doing', 'started', 'active', 'wip', 'in development', 'working on it', 'ongoing'],
  in_review: ['in review', 'review', 'code review', 'qa', 'in qa', 'testing', 'in testing', 'ready for review'],
  done: ['done', 'complete', 'completed', 'closed', 'resolved', 'shipped', 'released', 'fixed', 'finished'],
  canceled: ['canceled', 'cancelled', 'won’t do', "won't do", 'wont do', "won't fix", 'wont fix', 'duplicate', 'rejected', 'abandoned', 'archived'],
}

export function guessStatus(value: string): Status | null {
  const k = key(value)
  for (const [status, words] of Object.entries(STATUS_WORDS) as [Status, string[]][]) {
    if (words.includes(k)) return status
  }
  return null
}

const PRIORITY_WORDS: Record<Priority, string[]> = {
  0: ['', 'no priority', 'none', 'not set'],
  1: ['urgent', 'highest', 'critical', 'blocker', 'p0', 'asap'],
  2: ['high', 'p1', 'major'],
  3: ['medium', 'normal', 'p2', 'moderate'],
  4: ['low', 'lowest', 'minor', 'trivial', 'p3', 'p4'],
}

export function guessPriority(value: string): Priority | null {
  const k = key(value)
  if (/^[0-4]$/.test(k)) return Number(k) as Priority
  for (const [priority, words] of Object.entries(PRIORITY_WORDS)) {
    if (words.includes(k)) return Number(priority) as Priority
  }
  return null
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const pad = (n: number) => String(n).padStart(2, '0')

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * "2026-11-02", "2026-11-02T10:00:00Z", "2026/11/02", Jira's "02/Nov/26 10:00 AM", Notion's
 * "November 2, 2026" (or a range "… → …": its start), "2 Nov 2026", "Nov 2, 2026". Ambiguous
 * all-number dates (02/11/2026) aren't guessed. Gives YYYY-MM-DD or null.
 */
export function parseDate(value: string): string | null {
  const text = value.split('→')[0].trim()
  if (!text) return null
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(text)
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[/\s-]([A-Za-z]{3,})[/\s-,]+(\d{2,4})/.exec(text)
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return month ? isoDate(year, month, Number(m[1])) : null
  }
  m = /^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(text)
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1
    return month ? isoDate(Number(m[3]), month, Number(m[2])) : null
  }
  return null
}

/** The first number, rounded, kept within 0–100 (the database's range). */
export function parseEstimate(value: string): number | null {
  const m = /-?\d+(?:[.,]\d+)?/.exec(value)
  if (!m) return null
  return Math.min(100, Math.max(0, Math.round(Number(m[0].replace(',', '.')))))
}

/** A label fits the database's 40 characters: a longer name is cut at a word and ends with "…". */
export function labelName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ')
  if (name.length <= 40) return name
  const cut = name.slice(0, 39)
  const space = cut.lastIndexOf(' ')
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** "bug, ui; backend" → ['bug', 'ui', 'backend'], each fitting a label. */
export function splitLabels(value: string): string[] {
  return value
    .split(/[,;]/)
    .map(labelName)
    .filter(Boolean)
}

/** Notion lists several people in one cell; an issue has one assignee, the first. */
export const firstPerson = (value: string) => value.split(/[,;]/)[0].trim()

const letters = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')

/**
 * The person a name or email in the file means: the same display name, or an email whose name
 * part spells it ("jane.doe@…" → Jane Doe), or a first name only one person has.
 */
export function matchPerson(value: string, people: { id: string; name: string }[]): string | null {
  const text = value.trim()
  if (!text) return null
  const wanted = letters(text.includes('@') ? text.split('@')[0] : text)
  if (!wanted) return null
  const exact = people.filter((p) => letters(p.name) === wanted)
  if (exact.length === 1) return exact[0].id
  if (text.includes('@') || exact.length > 1) return null
  const first = people.filter((p) => letters(p.name.split(/\s+/)[0] ?? '') === wanted)
  return first.length === 1 ? first[0].id : null
}

/** A sprint by number ("3", "Sprint 3", "Cycle 3", Jira's "CAP Sprint 3") or by name. */
export function matchSprint(value: string, sprints: { id: string; number: number; name: string | null }[]): string | null {
  const text = value.trim()
  if (!text) return null
  const byName = sprints.find((s) => s.name && key(s.name) === key(text))
  if (byName) return byName.id
  const m = /(?:^|\s)(?:sprint|cycle|iteration)?\s*#?(\d+)$/i.exec(text)
  return m ? (sprints.find((s) => s.number === Number(m[1]))?.id ?? null) : null
}

export type FileSprint = { ref: string; number: number | null; name: string | null; starts_on: string; ends_on: string }

const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10)

/**
 * A sprint described by the file (Linear's Cycle Number, Name, Start and End), or null without
 * readable dates. Linear's end is the moment the next cycle starts, so the sprint ends the day
 * before (DevDock's sprints include their last day and may not overlap). A name that only repeats
 * the number ("Cycle 3") is dropped: DevDock shows "Sprint 3" itself.
 */
export function fileSprint(ref: string, name: string, start: string, end: string): FileSprint | null {
  const from = Date.parse(start)
  const to = Date.parse(end)
  if (Number.isNaN(from) || Number.isNaN(to)) return null
  const starts_on = utcDay(from)
  const last = utcDay(to - 24 * 60 * 60 * 1000)
  const number = /^\d+$/.test(ref.trim()) ? Number(ref.trim()) : null
  const label = name.trim()
  return {
    ref,
    number,
    name: !label || /^(cycle|sprint|iteration)\s*#?\d+$/i.test(label) ? null : label.slice(0, 80),
    starts_on,
    ends_on: last < starts_on ? starts_on : last,
  }
}
