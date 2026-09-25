// When you last opened each workspace, per browser (localStorage). Only used to
// order the sidebar's "recent" items, so losing it is harmless.

const key = (teamId: string) => `devdock:recent-workspaces:${teamId}`

export function readRecentVisits(teamId: string): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(teamId)) ?? '{}')
    return value && typeof value === 'object' ? (value as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export function rememberVisit(teamId: string, workspaceId: string) {
  try {
    const visits = readRecentVisits(teamId)
    visits[workspaceId] = Date.now()
    // Keep it small: the 30 most recent.
    const trimmed = Object.fromEntries(Object.entries(visits).sort((a, b) => b[1] - a[1]).slice(0, 30))
    localStorage.setItem(key(teamId), JSON.stringify(trimmed))
    window.dispatchEvent(new Event('devdock:recent-workspaces'))
  } catch {
    // Storage unavailable (private mode): the sidebar falls back to "recently updated".
  }
}

/** How many items each sidebar section shows. */
export const SIDEBAR_LIMIT = 3

/**
 * The items a sidebar section shows: pinned first (in pin order), then the
 * most recently opened (falling back to most recently updated), up to
 * SIDEBAR_LIMIT. The open workspace is always included so you can see where you are.
 */
export function pickSidebarItems<T extends { id: string; updated_at: string }>(
  items: T[],
  pins: { workspace_id: string }[],
  visits: Record<string, number>,
  activeId: string | undefined,
): { shown: T[]; hidden: number } {
  const pinnedOrder = pins.map((p) => p.workspace_id)
  const pinned = pinnedOrder.flatMap((id) => items.filter((w) => w.id === id))
  const rest = items
    .filter((w) => !pinnedOrder.includes(w.id))
    .sort((a, b) => (visits[b.id] ?? 0) - (visits[a.id] ?? 0) || b.updated_at.localeCompare(a.updated_at))
  const shown = [...pinned, ...rest].slice(0, SIDEBAR_LIMIT)
  const active = items.find((w) => w.id === activeId)
  if (active && !shown.includes(active)) shown.push(active)
  return { shown, hidden: items.length - shown.length }
}
