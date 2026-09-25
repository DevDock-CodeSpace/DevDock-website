import { queryOptions } from '@tanstack/react-query'
import type { PersonProfile } from '@/features/teams/api'
import type { WorkspaceType } from '@/features/workspaces/api'
import { DataError, requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database.types'

// Documents: workspace_id null = team-wide, otherwise assigned to that workspace.
// RLS decides who sees what; these queries just ask for "everything I can see".

export type DocSummary = {
  id: string
  team_id: string
  workspace_id: string | null
  title: string
  created_at: string
  updated_at: string
  author: PersonProfile
  /** null for team-wide docs. */
  workspace: { id: string; title: string; type: WorkspaceType } | null
}
/** `body` is TipTap JSON (null = empty); `content` is its plain-text copy. */
export type Doc = DocSummary & { content: string; body: Json | null }

// Content is left out of lists; it can be large.
const SUMMARY =
  'id, team_id, workspace_id, title, created_at, updated_at, author:profiles!documents_created_by_fkey(display_name, avatar_url), workspace:workspaces!documents_workspace_team_fkey(id, title, type)'

const IMAGE_BUCKET = 'doc-images'

const writeErrors = { '42501': 'You don’t have permission to change docs here.' }

// ---------------------------------------------------------------- queries

/** Team → Docs: team-wide docs plus docs of every workspace the caller can see. */
export const teamDocsQuery = (teamId: string) =>
  queryOptions({
    queryKey: ['documents', 'team', teamId],
    queryFn: async (): Promise<DocSummary[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select(SUMMARY)
        .eq('team_id', teamId)
        .order('updated_at', { ascending: false })
      if (error) throw toDataError('load docs', error)
      return data
    },
  })

/** Workspace → Docs: only docs assigned to this workspace. */
export const workspaceDocsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['documents', 'workspace', workspaceId],
    queryFn: async (): Promise<DocSummary[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select(SUMMARY)
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false })
      if (error) throw toDataError('load docs', error)
      return data
    },
  })

/** null when the doc doesn't exist or the caller can't read it. */
export const documentQuery = (docId: string) =>
  queryOptions({
    queryKey: ['documents', docId],
    queryFn: async (): Promise<Doc | null> => {
      const { data, error } = await supabase
        .from('documents')
        .select(`${SUMMARY}, content, body`)
        .eq('id', docId)
        .maybeSingle()
      if (error) throw toDataError('load the doc', error)
      return data
    },
  })

// -------------------------------------------------------------- mutations

/** created_by is set by the database (auth.uid()); scope can't change later. */
export async function createDocument(input: {
  teamId: string
  workspaceId: string | null
  title: string
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('documents')
    .insert({ team_id: input.teamId, workspace_id: input.workspaceId, title: input.title.trim() })
    .select('id')
    .single()
  if (error) throw toDataError('create the doc', error, writeErrors)
  return data
}

/** Saves the title, the rich body, and its plain-text copy (written together). */
export async function updateDocument(docId: string, input: { title: string; body: Json; content: string }) {
  const { data, error } = await supabase
    .from('documents')
    .update({ title: input.title.trim(), body: input.body, content: input.content })
    .eq('id', docId)
    .select('id')
  if (error) throw toDataError('save the doc', error, writeErrors)
  requireAffected(data, 'save doc')
}

/**
 * Deletes the doc's images first (Storage RLS only allows it while the doc
 * exists and the caller can edit it), then the doc itself.
 */
export async function deleteDocument(teamId: string, docId: string) {
  const folder = `${teamId}/${docId}`
  const { data: files, error: listError } = await supabase.storage.from(IMAGE_BUCKET).list(folder, { limit: 1000 })
  if (listError) throw toDataError('delete the doc', { message: listError.message })
  if (files.length > 0) {
    const { error: removeError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .remove(files.map((file) => `${folder}/${file.name}`))
    if (removeError) throw toDataError('delete the doc', { message: removeError.message })
  }
  const { data, error } = await supabase.from('documents').delete().eq('id', docId).select('id')
  if (error) throw toDataError('delete the doc', error, writeErrors)
  requireAffected(data, 'delete doc')
}

// ----------------------------------------------------------------- images
// Private bucket; object path <team_id>/<document_id>/<file>. Storage RLS
// mirrors the doc: readers can view, editors can upload/delete.

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024

/** Uploads an image for a doc and returns its storage path (stored in the doc, not a URL). */
export async function uploadDocImage(teamId: string, docId: string, file: File): Promise<string> {
  if (!IMAGE_TYPES.includes(file.type)) throw new DataError('Only PNG, JPEG, GIF or WebP images can be added.')
  if (file.size > IMAGE_MAX_BYTES) throw new DataError('Images can be at most 10 MB.')
  const ext = file.type.split('/')[1].replace('jpeg', 'jpg')
  const path = `${teamId}/${docId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw toDataError('upload the image', { message: error.message }, writeErrors)
  return path
}

const SIGNED_URL_SECONDS = 60 * 60

/** Short-lived URL for a private doc image; refreshed before it expires. */
export const docImageUrlQuery = (path: string) =>
  queryOptions({
    queryKey: ['documents', 'image', path],
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS)
      if (error) throw toDataError('load the image', { message: error.message })
      return data.signedUrl
    },
    staleTime: (SIGNED_URL_SECONDS - 10 * 60) * 1000,
  })
