import type { DocFolder } from './api'

// Folder tree helpers. Scopes hold a handful of folders, so plain array scans are fine.

/** The folder and its ancestors, top level first (for breadcrumbs). Empty for the top level. */
export function folderPath(folderId: string | null, folders: DocFolder[]): DocFolder[] {
  const path: DocFolder[] = []
  let current = folders.find((f) => f.id === folderId)
  while (current && path.length < 10) {
    path.unshift(current)
    current = folders.find((f) => f.id === current?.parent_id)
  }
  return path
}

/** The folder's id plus every folder below it. */
export function folderSubtree(folderId: string, folders: DocFolder[]): Set<string> {
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

/** Folders in tree order (each followed by its children), for pickers. */
export function folderTree(folders: DocFolder[], parentId: string | null = null): DocFolder[] {
  return folders
    .filter((f) => f.parent_id === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((f) => [f, ...folderTree(folders, f.id)])
}
