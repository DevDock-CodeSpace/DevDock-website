import type { Collection, WorkspaceSummary } from '@/features/workspaces/api'
import type { TeamType } from './api'
import { chatPath, learningPath, teamPath } from './nav'

/** Where a group opens (after signing in, or switching group or collection): its loader picks the page. */
export const startPath = (slug: string) => `${teamPath(slug)}/start`

/**
 * The page a group opens on (owner's rule, 2026-10-26). The type is the collection in view's, else the
 * group's. Learning opens the course you last had open, on its Learning tab (it shows the next lesson),
 * else the first course; with no course to open, and for development and general, Chat.
 */
export function landingPath(
  slug: string,
  teamType: TeamType,
  collection: Collection | null,
  workspaces: WorkspaceSummary[],
  visits: Record<string, number>,
): string {
  if ((collection?.type ?? teamType) !== 'learning') return chatPath(slug)
  // In a collection: its courses, and courses outside any collection (they belong to every view).
  const courses = workspaces.filter(
    (w) =>
      w.type === 'course' &&
      w.modules.includes('learning') &&
      (!collection || w.collection_id === collection.id || w.collection_id === null),
  )
  if (courses.length === 0) return chatPath(slug)
  // Most recently opened first; never opened keeps the list's order (by title), so the first course.
  const [course] = [...courses].sort((a, b) => (visits[b.id] ?? 0) - (visits[a.id] ?? 0))
  return learningPath(slug, course.id)
}
