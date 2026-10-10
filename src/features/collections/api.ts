import type { TeamType } from '@/features/teams/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { TablesInsert } from '@/types/database.types'

// Collections are read with the group's workspaces (teamCollectionsQuery in features/workspaces/api.ts),
// so there is no query here: only the writes. Group owners and admins only (RLS).

const NAME_TAKEN = { '23505': 'This group already has a collection with that name.' }

export async function createCollection(teamId: string, input: { name: string; type: TeamType }): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('workspace_collections')
    .insert({ team_id: teamId, name: input.name.trim(), type: input.type })
    .select('id')
    .single()
  if (error) throw toDataError('create the collection', error, { ...NAME_TAKEN, '54000': 'A group can have at most 30 collections.' })
  return data
}

export async function updateCollection(collectionId: string, input: { name: string; type: TeamType }) {
  const { data, error } = await supabase
    .from('workspace_collections')
    .update({ name: input.name.trim(), type: input.type })
    .eq('id', collectionId)
    .select('id')
  if (error) throw toDataError('save the collection', error, NAME_TAKEN)
  requireAffected(data, 'update collection')
}

/** Its workspaces return to the top level; the ones open to it keep its people as members (DB trigger). */
export async function deleteCollection(collectionId: string) {
  const { data, error } = await supabase.from('workspace_collections').delete().eq('id', collectionId).select('id')
  if (error) throw toDataError('delete the collection', error)
  requireAffected(data, 'delete collection')
}

export async function addCollectionMember(collectionId: string, userId: string) {
  // team_id is NOT NULL but always set by a DB trigger from the collection (clients have no INSERT
  // privilege on it). Generated types can't see triggers, so omit it here.
  const row: Omit<TablesInsert<'workspace_collection_members'>, 'team_id'> = { collection_id: collectionId, user_id: userId }
  const { error } = await supabase
    .from('workspace_collection_members')
    .insert(row as TablesInsert<'workspace_collection_members'>)
  // Already in it (added in another tab) is fine.
  if (error && error.code !== '23505') throw toDataError('add them', error)
}

export async function removeCollectionMember(collectionId: string, userId: string) {
  const { data, error } = await supabase
    .from('workspace_collection_members')
    .delete()
    .eq('collection_id', collectionId)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw toDataError('remove them', error)
  requireAffected(data, 'remove collection member')
}
