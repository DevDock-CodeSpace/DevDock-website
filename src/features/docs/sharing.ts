import { queryOptions } from '@tanstack/react-query'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { TablesInsert } from '@/types/database.types'

// Restricted docs, whiteboards and folders (migration 20261026171024_restricted_files). Each has an
// access: 'place' (everyone who can open its group or workspace) or 'restricted' (its owner, the people
// it's shared with, and group owners/admins). The database decides; these only read and change it.

export type FileAccess = 'place' | 'restricted'
export type FileKind = 'doc' | 'diagram' | 'folder'
export type ShareRole = 'viewer' | 'editor'
export type FileShare = { id: string; user_id: string; role: ShareRole }

const TABLE: Record<FileKind, 'documents' | 'diagrams' | 'doc_folders'> = { doc: 'documents', diagram: 'diagrams', folder: 'doc_folders' }
const COLUMN: Record<FileKind, 'document_id' | 'diagram_id' | 'folder_id'> = { doc: 'document_id', diagram: 'diagram_id', folder: 'folder_id' }
const errors = { '42501': 'Only its owner or a group admin can change who may open it.', '23514': 'They can’t open this workspace, so they can’t be given this.' }

/** Who an item is shared with (only loaded while its Share dialog is open). */
export const fileSharesQuery = (kind: FileKind, itemId: string) =>
  queryOptions({
    queryKey: ['file-shares', kind, itemId],
    queryFn: async (): Promise<FileShare[]> => {
      const { data, error } = await supabase.from('file_shares').select('id, user_id, role').eq(COLUMN[kind], itemId).order('created_at')
      if (error) throw toDataError('load who it’s shared with', error)
      return data as FileShare[]
    },
  })

export async function setFileAccess(kind: FileKind, itemId: string, access: FileAccess) {
  const { data, error } = await supabase.from(TABLE[kind]).update({ access }).eq('id', itemId).select('id')
  if (error) throw toDataError('change who may open it', error, errors)
  requireAffected(data, 'change who may open it')
}

export async function shareFile(kind: FileKind, itemId: string, userId: string, role: ShareRole) {
  const row: Omit<TablesInsert<'file_shares'>, 'team_id'> = { [COLUMN[kind]]: itemId, user_id: userId, role }
  // team_id is copied from the item by a trigger (clients can't set it); the generated type can't see that.
  const { error } = await supabase.from('file_shares').insert(row as TablesInsert<'file_shares'>)
  if (error) throw toDataError('share it', error, errors)
}

export async function setShareRole(shareId: string, role: ShareRole) {
  const { data, error } = await supabase.from('file_shares').update({ role }).eq('id', shareId).select('id')
  if (error) throw toDataError('change their access', error, errors)
  requireAffected(data, 'change their access')
}

export async function unshareFile(shareId: string) {
  const { data, error } = await supabase.from('file_shares').delete().eq('id', shareId).select('id')
  if (error) throw toDataError('remove their access', error, errors)
  requireAffected(data, 'remove their access')
}
