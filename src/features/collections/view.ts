import type { Collection, WorkspaceSummary } from '@/features/workspaces/api'

// Which collection a person is looking at, per group and per browser (localStorage). A group with
// collections is shown one collection at a time: the sidebar and the group pages follow the choice.
// It is a way of looking, not access: RLS decides what can be opened, whatever is chosen here.

const key = (teamId: string) => `devdock:collection-view:${teamId}`
export const COLLECTION_VIEW_EVENT = 'devdock:collection-view'

export function readCollectionView(teamId: string): string | null {
  try {
    return localStorage.getItem(key(teamId))
  } catch {
    return null
  }
}

export function rememberCollectionView(teamId: string, collectionId: string) {
  try {
    localStorage.setItem(key(teamId), collectionId)
    window.dispatchEvent(new Event(COLLECTION_VIEW_EVENT))
  } catch {
    // Storage unavailable (private mode): the first collection is shown each time.
  }
}

/**
 * The collections a person can switch between: the ones they are in, or that hold something they can
 * open. Group owners and admins get all of them (an empty one still needs somewhere to be filled).
 */
export function availableCollections(
  collections: Collection[],
  workspaces: Pick<WorkspaceSummary, 'collection_id'>[],
  userId: string,
  isAdmin: boolean,
): Collection[] {
  return collections.filter(
    (c) => isAdmin || c.memberIds.includes(userId) || workspaces.some((w) => w.collection_id === c.id),
  )
}

/**
 * The collection to show: the remembered one while it is still available, else the first one the
 * person is in, else the first available. null when the group has no collections for them, which
 * means "show everything", as before collections existed.
 */
export function pickCollection(available: Collection[], remembered: string | null, userId: string): Collection | null {
  return (
    available.find((c) => c.id === remembered) ??
    available.find((c) => c.memberIds.includes(userId)) ??
    available[0] ??
    null
  )
}
