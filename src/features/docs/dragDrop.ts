import type { DocFolder, DocSummary } from './api'
import { MAX_FOLDER_DEPTH } from './api'

// The rules for dragging docs and folders around the Docs browser (and for "Move to…"), kept pure so
// they can be tested. The database enforces the same rules; this is what decides which drop targets
// light up and which show "not allowed".

/** dataTransfer type for an in-app drag of docs and folders. */
export const DRAG_TYPE = 'application/x-devdock-items'

/** What is being moved. */
export type DragItems = { docIds: string[]; folderIds: string[] }

export const itemCount = (items: DragItems) => items.docIds.length + items.folderIds.length

export const docKey = (id: string) => `doc:${id}`
export const folderKey = (id: string) => `folder:${id}`

/** Splits selection keys ("doc:<id>", "folder:<id>") back into ids. */
export function itemsOf(keys: Iterable<string>): DragItems {
  const items: DragItems = { docIds: [], folderIds: [] }
  for (const key of keys) {
    if (key.startsWith('doc:')) items.docIds.push(key.slice(4))
    else if (key.startsWith('folder:')) items.folderIds.push(key.slice(7))
  }
  return items
}

/** Levels in a folder's subtree, counting itself (1 = no subfolders). */
export function subtreeHeight(folderId: string, folders: DocFolder[]): number {
  const start = folders.find((f) => f.id === folderId)
  if (!start) return 1
  let deepest = start.depth
  let frontier = [folderId]
  while (frontier.length > 0) {
    const next = folders.filter((f) => f.parent_id !== null && frontier.includes(f.parent_id))
    for (const f of next) deepest = Math.max(deepest, f.depth)
    frontier = next.map((f) => f.id)
  }
  return deepest - start.depth + 1
}

/** `folderId` and every folder inside it. */
function within(folderId: string, folders: DocFolder[]): Set<string> {
  const ids = new Set([folderId])
  for (let grew = true; grew; ) {
    grew = false
    for (const f of folders) {
      if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
        ids.add(f.id)
        grew = true
      }
    }
  }
  return ids
}

/**
 * Why these items can't go into `targetId` (null = the top level), or null when they can.
 * `docs` are the docs of the scope, to know where each one is now.
 */
export function dropBlocker(items: DragItems, targetId: string | null, folders: DocFolder[], docs: DocSummary[]): string | null {
  if (itemCount(items) === 0) return 'Nothing to move'
  for (const id of items.folderIds) {
    if (targetId !== null && within(id, folders).has(targetId)) return 'A folder can’t go inside itself'
  }
  const target = targetId === null ? null : folders.find((f) => f.id === targetId)
  if (targetId !== null && !target) return 'That folder isn’t here any more'
  const base = target?.depth ?? 0
  for (const id of items.folderIds) {
    if (base + subtreeHeight(id, folders) > MAX_FOLDER_DEPTH) return `Folders can be nested ${MAX_FOLDER_DEPTH} levels deep`
  }
  const folderHere = (id: string) => (folders.find((f) => f.id === id)?.parent_id ?? null) === targetId
  const docHere = (id: string) => (docs.find((d) => d.id === id)?.folder_id ?? null) === targetId
  if (items.folderIds.every(folderHere) && items.docIds.every(docHere)) return 'Already here'
  return null
}

/** "Report.doc", "3 items": what the drag ghost and the toasts call the items. */
export function describeItems(items: DragItems, docs: DocSummary[], folders: DocFolder[]) {
  const total = itemCount(items)
  if (total !== 1) return `${total} items`
  const doc = docs.find((d) => d.id === items.docIds[0])
  if (doc) return `“${doc.title}”`
  return `“${folders.find((f) => f.id === items.folderIds[0])?.name ?? 'folder'}”`
}
