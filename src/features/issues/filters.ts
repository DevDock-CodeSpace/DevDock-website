import type { Issue, IssuePriority, IssueStatus } from './api'
import { STATUS_ORDER } from './meta'

// Issue list filters, kept in the URL so a filtered view can be shared or
// bookmarked: ?tab=active&status=todo,in_review&assignee=me&label=<id>&cycle=current

export type IssueTab = 'all' | 'active' | 'backlog' | 'mine'

export const ISSUE_TABS: { id: IssueTab; label: string }[] = [
  { id: 'all', label: 'All issues' },
  { id: 'active', label: 'Active' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'mine', label: 'My issues' },
]

export type FilterFacet = 'status' | 'priority' | 'assignee' | 'label' | 'cycle'

/** Selected values per facet. assignee: user ids, "me" or "none"; cycle: ids, "current" or "none". */
export type IssueFilters = Record<FilterFacet, string[]>

export const FACETS: FilterFacet[] = ['status', 'priority', 'assignee', 'label', 'cycle']

export const facetLabel: Record<FilterFacet, string> = {
  status: 'Status',
  priority: 'Priority',
  assignee: 'Assignee',
  label: 'Labels',
  cycle: 'Cycle',
}

export function readTab(params: URLSearchParams): IssueTab {
  const tab = params.get('tab')
  return tab === 'active' || tab === 'backlog' || tab === 'mine' ? tab : 'all'
}

export function readFilters(params: URLSearchParams): IssueFilters {
  const list = (key: string) => (params.get(key) ?? '').split(',').filter(Boolean)
  return {
    status: list('status').filter((s) => (STATUS_ORDER as string[]).includes(s)),
    priority: list('priority').filter((p) => ['0', '1', '2', '3', '4'].includes(p)),
    assignee: list('assignee'),
    label: list('label'),
    cycle: list('cycle'),
  }
}

/** Writes filters into (a copy of) the params; empty facets are removed. */
export function writeFilters(params: URLSearchParams, filters: IssueFilters) {
  const next = new URLSearchParams(params)
  for (const facet of FACETS) {
    if (filters[facet].length) next.set(facet, filters[facet].join(','))
    else next.delete(facet)
  }
  return next
}

export const hasFilters = (filters: IssueFilters) => FACETS.some((f) => filters[f].length > 0)

const ACTIVE: IssueStatus[] = ['todo', 'in_progress', 'in_review']

/**
 * Tab first (Linear's All / Active / Backlog, plus My issues), then every
 * facet: an issue must match one of the chosen values in each facet.
 */
export function applyFilters(
  issues: Issue[],
  tab: IssueTab,
  filters: IssueFilters,
  context: { userId: string; currentCycleId: string | undefined },
) {
  const match = (facet: FilterFacet, test: (value: string) => boolean) =>
    filters[facet].length === 0 || filters[facet].some(test)

  return issues.filter((issue) => {
    if (tab === 'active' && !ACTIVE.includes(issue.status)) return false
    if (tab === 'backlog' && issue.status !== 'backlog') return false
    if (tab === 'mine' && issue.assignee_id !== context.userId) return false
    return (
      match('status', (s) => issue.status === s) &&
      match('priority', (p) => issue.priority === (Number(p) as IssuePriority)) &&
      match('assignee', (a) =>
        a === 'none' ? issue.assignee_id === null : issue.assignee_id === (a === 'me' ? context.userId : a),
      ) &&
      match('label', (l) => issue.labelIds.includes(l)) &&
      match('cycle', (c) =>
        c === 'none'
          ? issue.cycle_id === null
          : issue.cycle_id !== null && issue.cycle_id === (c === 'current' ? context.currentCycleId : c),
      )
    )
  })
}
