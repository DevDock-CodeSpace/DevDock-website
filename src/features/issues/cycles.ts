import type { Issue, IssueCycle } from './api'
import { isClosed } from './meta'

// Cycle helpers. Dates are "YYYY-MM-DD" strings, so they compare as text;
// `today` comes from localDateISO() so "current" follows the viewer's calendar.

export type CycleState = 'current' | 'upcoming' | 'past'

export function cycleState(cycle: IssueCycle, today: string): CycleState {
  if (cycle.ends_on < today) return 'past'
  if (cycle.starts_on > today) return 'upcoming'
  return 'current'
}

/** "5 days left", "Ends today", "Starts tomorrow", "Starts in 3 days", "Ended Sep 28". */
export function cycleWhen(cycle: IssueCycle, today: string, formatEnd: (date: string) => string) {
  const state = cycleState(cycle, today)
  if (state === 'past') return `Ended ${formatEnd(cycle.ends_on)}`
  if (state === 'current') {
    const left = daysBetween(today, cycle.ends_on)
    return left === 0 ? 'Ends today' : `${left} ${left === 1 ? 'day' : 'days'} left`
  }
  const until = daysBetween(today, cycle.starts_on)
  return until === 1 ? 'Starts tomorrow' : `Starts in ${until} days`
}

/** "Cycle 3" or "Cycle 3 · Auth sprint". */
export function cycleTitle(cycle: Pick<IssueCycle, 'number' | 'name'>) {
  return cycle.name ? `Cycle ${cycle.number} · ${cycle.name}` : `Cycle ${cycle.number}`
}

export function currentCycle(cycles: IssueCycle[], today: string) {
  return cycles.find((c) => cycleState(c, today) === 'current')
}

/** The first cycle that starts after this one ends (cycles are sorted by start). */
export function nextCycle(cycles: IssueCycle[], cycle: IssueCycle) {
  return cycles.find((c) => c.starts_on > cycle.ends_on)
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string) {
  const ms = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
    Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  return Math.round(ms / 86_400_000)
}

/** "YYYY-MM-DD" plus n days. */
export function addDays(date: string, days: number) {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + days))
  return d.toISOString().slice(0, 10)
}

/** Scope / started / completed, as on Linear's cycle page. */
export function cycleProgress(issues: Issue[]) {
  const scope = issues.filter((i) => i.status !== 'canceled')
  const completed = scope.filter((i) => isClosed(i.status)).length
  const started = scope.filter((i) => i.status === 'in_progress' || i.status === 'in_review').length
  return {
    scope: scope.length,
    started,
    completed,
    percent: scope.length === 0 ? 0 : Math.round((completed / scope.length) * 100),
  }
}
