import type { Issue, IssueCycle, IssueLabel, IssuePriority } from './api'
import { priorityLabel } from './meta'
import { addDays, daysBetween } from './cycles'
import type { PersonProfile } from '@/features/teams/api'

// What the cycle insights panel shows: how scope, started and completed moved day by day (rebuilt from the
// issue activity log, so issues added or removed mid-cycle show up as scope changes), and how the cycle
// splits by assignee, label and priority.

/** One row of the activity log that matters here: an issue moving between cycles, or changing status. */
export type CycleEvent = {
  issue_id: string
  kind: 'cycle' | 'status'
  from_value: string | null
  to_value: string | null
  created_at: string
}

/** An issue that is, or once was, in the cycle. */
export type HistoryIssue = Pick<Issue, 'id' | 'created_at' | 'estimate' | 'status'>

export type Metric = 'issues' | 'hours'
export type SeriesPoint = { date: string; scope: number; started: number; completed: number }

const MAX_DAYS = 120
const weight = (issue: Pick<Issue, 'estimate'>, metric: Metric) => (metric === 'hours' ? (issue.estimate ?? 0) : 1)

/** The end of a local calendar day ("YYYY-MM-DD"), as a timestamp. */
const endOfDay = (date: string) => new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 23, 59, 59, 999).getTime()

/**
 * Scope, started (in progress or in review) and completed at the end of each day of the cycle, up to today
 * (or its last day, for a cycle that is over). Canceled issues are not in scope. Empty for an upcoming cycle.
 */
export function cycleSeries(input: {
  cycle: Pick<IssueCycle, 'id' | 'starts_on' | 'ends_on'>
  today: string
  issues: HistoryIssue[]
  events: CycleEvent[]
  metric?: Metric
}): SeriesPoint[] {
  const { cycle, today, issues, events, metric = 'issues' } = input
  if (cycle.starts_on > today) return []
  const last = cycle.ends_on < today ? cycle.ends_on : today
  const days = Math.min(daysBetween(cycle.starts_on, last), MAX_DAYS)

  const byIssue = new Map<string, { moves: { at: number; enters: boolean }[]; statuses: { at: number; from: string | null; to: string | null }[] }>()
  for (const event of events) {
    const entry = byIssue.get(event.issue_id) ?? { moves: [], statuses: [] }
    const at = Date.parse(event.created_at)
    if (event.kind === 'cycle') {
      if (event.to_value === cycle.id) entry.moves.push({ at, enters: true })
      else if (event.from_value === cycle.id) entry.moves.push({ at, enters: false })
    } else {
      entry.statuses.push({ at, from: event.from_value, to: event.to_value })
    }
    byIssue.set(event.issue_id, entry)
  }
  for (const entry of byIssue.values()) {
    entry.moves.sort((a, b) => a.at - b.at)
    entry.statuses.sort((a, b) => a.at - b.at)
  }

  const timelines = issues.map((issue) => {
    const entry = byIssue.get(issue.id)
    const moves = entry?.moves ?? []
    const statuses = entry?.statuses ?? []
    const created = Date.parse(issue.created_at)
    // In the cycle since it was created, unless its first move into this cycle came later.
    const startsIn = moves.length === 0 || !moves[0].enters
    return {
      weight: weight(issue, metric),
      inCycleAt(t: number) {
        let inside = startsIn && t >= created
        for (const move of moves) {
          if (move.at > t) break
          inside = move.enters
        }
        return inside
      },
      statusAt(t: number): string {
        if (statuses.length === 0) return issue.status
        let status = statuses[0].from ?? 'todo'
        for (const change of statuses) {
          if (change.at > t) break
          status = change.to ?? status
        }
        return status
      },
    }
  })

  const series: SeriesPoint[] = []
  for (let day = 0; day <= days; day++) {
    const date = addDays(cycle.starts_on, day)
    const t = endOfDay(date)
    const point: SeriesPoint = { date, scope: 0, started: 0, completed: 0 }
    for (const issue of timelines) {
      if (!issue.inCycleAt(t)) continue
      const status = issue.statusAt(t)
      if (status === 'canceled') continue
      point.scope += issue.weight
      if (status === 'in_progress' || status === 'in_review') point.started += issue.weight
      else if (status === 'done') point.completed += issue.weight
    }
    series.push(point)
  }
  return series
}

// ---------------------------------------------------------------- breakdown

export type BreakdownBy = 'assignee' | 'label' | 'priority'

export type BreakdownRow = {
  key: string
  label: string
  total: number
  done: number
  percent: number
  /** assignee rows: the person (null = unassigned) */
  profile?: PersonProfile
  /** label rows */
  color?: IssueLabel['color']
  /** priority rows */
  priority?: IssuePriority
}

/** Most urgent first, "No priority" last. */
const URGENT_FIRST: IssuePriority[] = [1, 2, 3, 4, 0]

/**
 * How the issues split by assignee, label or priority, with how much of each is done. Canceled issues are
 * left out. An issue with several labels counts under each of them.
 */
export function breakdown(
  issues: Issue[],
  by: BreakdownBy,
  context: { members: { user_id: string; profile: PersonProfile }[]; labels: IssueLabel[]; metric?: Metric },
): BreakdownRow[] {
  const metric = context.metric ?? 'issues'
  const rows = new Map<string, BreakdownRow>()
  const add = (key: string, make: () => Omit<BreakdownRow, 'total' | 'done' | 'percent' | 'key'>, issue: Issue) => {
    const row = rows.get(key) ?? { key, total: 0, done: 0, percent: 0, ...make() }
    const w = weight(issue, metric)
    row.total += w
    if (issue.status === 'done') row.done += w
    rows.set(key, row)
  }

  for (const issue of issues) {
    if (issue.status === 'canceled') continue
    if (by === 'assignee') {
      const member = context.members.find((m) => m.user_id === issue.assignee_id)
      add(
        issue.assignee_id ?? 'none',
        () => ({ label: issue.assignee_id ? (member?.profile?.display_name ?? 'Former member') : 'Unassigned', profile: member?.profile ?? null }),
        issue,
      )
    } else if (by === 'priority') {
      add(String(issue.priority), () => ({ label: priorityLabel[issue.priority], priority: issue.priority }), issue)
    } else if (issue.labelIds.length === 0) {
      add('none', () => ({ label: 'No label' }), issue)
    } else {
      for (const id of issue.labelIds) {
        const label = context.labels.find((l) => l.id === id)
        add(id, () => ({ label: label?.name ?? 'Deleted label', color: label?.color }), issue)
      }
    }
  }

  const list = [...rows.values()].map((row) => ({ ...row, percent: row.total === 0 ? 0 : Math.round((row.done / row.total) * 100) }))
  if (by === 'priority') return list.sort((a, b) => URGENT_FIRST.indexOf(a.priority ?? 0) - URGENT_FIRST.indexOf(b.priority ?? 0))
  return list.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
}

/** Scope, started and completed for the issues as they are now (canceled issues aren't in scope). */
export function cycleTotals(issues: Pick<Issue, 'status' | 'estimate'>[], metric: Metric = 'issues') {
  let scope = 0
  let started = 0
  let completed = 0
  for (const issue of issues) {
    if (issue.status === 'canceled') continue
    const w = weight(issue, metric)
    scope += w
    if (issue.status === 'in_progress' || issue.status === 'in_review') started += w
    else if (issue.status === 'done') completed += w
  }
  return { scope, started, completed }
}

/** True when at least one issue has an estimate (so "hours" means something). */
export const hasEstimates = (issues: Pick<Issue, 'estimate'>[]) => issues.some((issue) => issue.estimate !== null && issue.estimate > 0)

/** Whole-number share, "0%" for an empty cycle. */
export const share = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100))
