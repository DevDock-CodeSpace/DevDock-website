import { useEffect, useState } from 'react'
import { usePins } from '@/features/issues/viewsHooks'
import { readRecentVisits } from './recent'

/**
 * Which workspaces you starred (they're in the sidebar's Starred list, with everything else you
 * starred), plus an instant star/unstar toggle. Workspace pins became stars on 2026-10-27.
 */
export function useWorkspaceStars(teamId: string) {
  const { star, findStar, remove } = usePins(teamId)
  return {
    isStarred: (workspaceId: string) => findStar({ kind: 'workspace', workspaceId }) !== null,
    setStarred: (workspaceId: string, on: boolean) => {
      const existing = findStar({ kind: 'workspace', workspaceId })
      if (on && !existing) star({ kind: 'workspace', workspaceId })
      else if (!on && existing) remove.mutate(existing.id)
    },
  }
}

/** When each workspace in the team was last opened in this browser; updates as you move around. */
export function useRecentVisits(teamId: string) {
  const [visits, setVisits] = useState(() => readRecentVisits(teamId))
  useEffect(() => {
    const update = () => setVisits(readRecentVisits(teamId))
    update()
    window.addEventListener('devdock:recent-workspaces', update)
    return () => window.removeEventListener('devdock:recent-workspaces', update)
  }, [teamId])
  return visits
}
