import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamCollectionsQuery, teamWorkspacesQuery } from '@/features/workspaces/api'
import {
  availableCollections,
  COLLECTION_VIEW_EVENT,
  pickCollection,
  readCollectionView,
  rememberCollectionView,
} from './view'

/** The collection remembered for a group in this browser; follows changes made anywhere in the tab. */
function useRememberedCollection(teamId: string) {
  const [remembered, setRemembered] = useState(() => readCollectionView(teamId))
  useEffect(() => {
    const update = () => setRemembered(readCollectionView(teamId))
    update()
    window.addEventListener(COLLECTION_VIEW_EVENT, update)
    return () => window.removeEventListener(COLLECTION_VIEW_EVENT, update)
  }, [teamId])
  return remembered
}

/**
 * The collection being looked at in the current group, and the group's workspaces narrowed to it.
 * `collection` is null in a group without collections: then nothing is narrowed. Reads only what the
 * shell already loaded (one cache entry), so it adds no request wherever it is used.
 *
 * `inView(workspaceId)` is for lists that mix scopes: group-wide rows (null) belong to every view.
 */
export function useCollectionView() {
  const { user } = useAuth()
  const { team, can } = useCurrentTeam()
  const collections = useSuspenseQuery(teamCollectionsQuery(team.id)).data
  const everything = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const remembered = useRememberedCollection(team.id)
  const available = availableCollections(collections, everything, user.id, can.isAdmin)
  const collection = pickCollection(available, remembered, user.id)
  // Things outside any collection belong to the whole group, so every view shows them.
  const workspaces = collection
    ? everything.filter((w) => w.collection_id === collection.id || !collections.some((c) => c.id === w.collection_id))
    : everything
  const ids = new Set(workspaces.map((w) => w.id))
  return {
    collection,
    collections: available,
    workspaces,
    inView: (workspaceId: string | null) => !collection || workspaceId === null || ids.has(workspaceId),
    setCollection: (collectionId: string) => rememberCollectionView(team.id, collectionId),
  }
}
