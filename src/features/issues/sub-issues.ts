import type { Issue } from './api'
import { isClosed } from './meta'

/** Parent id → how many of its direct sub-issues are closed, out of how many. */
export function subIssueStats(issues: Issue[]): Map<string, { done: number; total: number }> {
  const stats = new Map<string, { done: number; total: number }>()
  for (const issue of issues) {
    if (!issue.parent_id) continue
    const s = stats.get(issue.parent_id) ?? { done: 0, total: 0 }
    s.total += 1
    if (isClosed(issue.status)) s.done += 1
    stats.set(issue.parent_id, s)
  }
  return stats
}
