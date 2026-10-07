import type { Json } from '@/types/database.types'
import { FACETS, NO_FILTERS, readFilters, readTab, writeFilters, type IssueFilters, type IssueTab } from './filters'

// A saved view is a name plus the three things the issues page keeps in the URL: the tab
// (All / Active / Backlog / My issues), the layout (list / board) and the filters. Opening a view
// copies its state into the URL, so the URL stays the one source of truth and any change you make
// afterwards shows as "modified" until you save it.

export type IssueLayout = 'list' | 'board'
export type ViewState = { tab: IssueTab; layout: IssueLayout; filters: IssueFilters }

export const DEFAULT_STATE: ViewState = { tab: 'all', layout: 'list', filters: NO_FILTERS }

/** The view that's open, kept next to the state it opened with: ?v=<id>&tab=active&status=todo */
export const VIEW_PARAM = 'v'

export function readViewState(params: URLSearchParams): ViewState {
  return { tab: readTab(params), layout: params.get('view') === 'board' ? 'board' : 'list', filters: readFilters(params) }
}

/** Writes tab, layout and filters into (a copy of) the params, leaving everything else (like ?v=) alone. */
export function writeViewState(params: URLSearchParams, state: ViewState) {
  const next = writeFilters(params, state.filters)
  if (state.tab === 'all') next.delete('tab')
  else next.set('tab', state.tab)
  if (state.layout === 'board') next.set('view', 'board')
  else next.delete('view')
  return next
}

/** Reads a stored filters document defensively: unknown keys and non-string values are dropped. */
export function parseFilters(json: Json | undefined): IssueFilters {
  const out: IssueFilters = { status: [], priority: [], assignee: [], label: [], cycle: [], repo: [] }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return out
  for (const facet of FACETS) {
    const value = json[facet]
    if (Array.isArray(value)) out[facet] = value.filter((item): item is string => typeof item === 'string')
  }
  return out
}

/** Only facets that have values (a smaller document, and `{}` for "no filters"). */
export function serializeFilters(filters: IssueFilters): Record<string, string[]> {
  return Object.fromEntries(FACETS.filter((facet) => filters[facet].length > 0).map((facet) => [facet, filters[facet]]))
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000')

/** Order inside a facet doesn't matter; everything else must match. */
export function sameViewState(a: ViewState, b: ViewState) {
  return a.tab === b.tab && a.layout === b.layout && FACETS.every((facet) => sameSet(a.filters[facet], b.filters[facet]))
}

export const isDefaultState = (state: ViewState) => sameViewState(state, DEFAULT_STATE)

type ViewLike = { id: string; layout: string; tab: string; filters: Json }

export function stateOfView(view: ViewLike): ViewState {
  const tab: IssueTab = view.tab === 'active' || view.tab === 'backlog' || view.tab === 'mine' ? view.tab : 'all'
  return { tab, layout: view.layout === 'board' ? 'board' : 'list', filters: parseFilters(view.filters) }
}

/** The page URL that opens a view (the view's state copied into the query). */
export function viewHref(issuesBase: string, view: ViewLike) {
  const params = writeViewState(new URLSearchParams({ [VIEW_PARAM]: view.id }), stateOfView(view))
  return `${issuesBase}?${params.toString()}`
}

/** A person's issues: everything assigned to them, nothing else. */
export function personHref(issuesBase: string, userId: string) {
  return `${issuesBase}?${new URLSearchParams({ assignee: userId }).toString()}`
}

export function tabHref(issuesBase: string, tab: IssueTab) {
  return tab === 'all' ? issuesBase : `${issuesBase}?tab=${tab}`
}

/** The one person whose issues this is, when the state is exactly "assigned to X" (and not "me"/"none"). */
export function personOf(state: ViewState): string | null {
  const { tab, filters } = state
  if (tab !== 'all') return null
  const others = FACETS.some((facet) => facet !== 'assignee' && filters[facet].length > 0)
  const [only, ...rest] = filters.assignee
  return !others && only && rest.length === 0 && only !== 'me' && only !== 'none' ? only : null
}
