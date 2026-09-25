import { queryOptions } from '@tanstack/react-query'
import type { PersonProfile } from '@/features/teams/api'
import type { WorkspaceType } from '@/features/workspaces/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

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
export type Doc = DocSummary & { content: string }

// Content is left out of lists; it can be large.
const SUMMARY =
  'id, team_id, workspace_id, title, created_at, updated_at, author:profiles!documents_created_by_fkey(display_name, avatar_url), workspace:workspaces!documents_workspace_team_fkey(id, title, type)'

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
        .select(`${SUMMARY}, content`)
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

export async function updateDocument(docId: string, input: { title: string; content: string }) {
  const { data, error } = await supabase
    .from('documents')
    .update({ title: input.title.trim(), content: input.content })
    .eq('id', docId)
    .select('id')
  if (error) throw toDataError('save the doc', error, writeErrors)
  requireAffected(data, 'save doc')
}

export async function deleteDocument(docId: string) {
  const { data, error } = await supabase.from('documents').delete().eq('id', docId).select('id')
  if (error) throw toDataError('delete the doc', error, writeErrors)
  requireAffected(data, 'delete doc')
}
