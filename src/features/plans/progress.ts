/** A plan's progress from the issues the reader can see: done out of all but the canceled. */
export function planProgress(issues: readonly { status: string }[]) {
  const counted = issues.filter((i) => i.status !== 'canceled')
  const done = counted.filter((i) => i.status === 'done').length
  return { done, total: counted.length, ratio: counted.length ? done / counted.length : 0 }
}

/** Issues by plan id, from one list (the hub's group list). */
export function issuesByPlan<T extends { plan_id: string | null }>(issues: readonly T[]) {
  const byPlan = new Map<string, T[]>()
  for (const issue of issues) {
    if (!issue.plan_id) continue
    const list = byPlan.get(issue.plan_id)
    if (list) list.push(issue)
    else byPlan.set(issue.plan_id, [issue])
  }
  return byPlan
}
