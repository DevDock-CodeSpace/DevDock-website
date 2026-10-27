import type { Plan, PlanStatus } from './api'

export const PLAN_STATUS_ORDER: PlanStatus[] = ['not_started', 'in_progress', 'paused', 'done', 'canceled']

export const planStatusLabel: Record<PlanStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  paused: 'Paused',
  done: 'Done',
  canceled: 'Canceled',
}

/** The dot in front of a plan's status (semantic, like issue status icons). */
export const planStatusDot: Record<PlanStatus, string> = {
  not_started: 'border border-muted-foreground bg-transparent',
  in_progress: 'bg-amber-500',
  paused: 'bg-muted-foreground',
  done: 'bg-brand',
  canceled: 'bg-muted-foreground/50',
}

export const isPlanOpen = (plan: Pick<Plan, 'status'>) => plan.status !== 'done' && plan.status !== 'canceled'

/** Open plans first (in progress, then not started, then paused), then by name. */
export function sortPlans<T extends Pick<Plan, 'status' | 'name'>>(plans: T[]): T[] {
  const rank: Record<PlanStatus, number> = { in_progress: 0, not_started: 1, paused: 2, done: 3, canceled: 4 }
  return [...plans].sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name))
}

/** The square tile behind a plan's status dot (the plan list and the plan page; no colour is stored). */
export const planStatusTile: Record<PlanStatus, string> = {
  in_progress: 'bg-amber-500/15',
  not_started: 'bg-muted',
  paused: 'bg-muted',
  done: 'bg-brand/15',
  canceled: 'bg-muted',
}
