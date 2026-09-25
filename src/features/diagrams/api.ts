import { queryOptions } from '@tanstack/react-query'
import type { DocSummary } from '@/features/docs/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database.types'

// Diagrams: same scope model and access rules as docs (workspace_id null =
// team-wide). RLS decides who sees what; these queries ask for "everything I can see".

/** Same shape as a doc summary, so the doc list/scope components render diagrams too. */
export type DiagramSummary = DocSummary
/** `data` is the editor JSON ({ nodes, edges }); parsed by the editor. */
export type Diagram = DiagramSummary & { data: Json }

// `data` is left out of lists; it can be large.
const SUMMARY =
  'id, team_id, workspace_id, title, created_at, updated_at, author:profiles!diagrams_created_by_fkey(display_name, avatar_url), workspace:workspaces!diagrams_workspace_team_fkey(id, title, type)'

const writeErrors = { '42501': 'You don’t have permission to change diagrams here.' }

// ---------------------------------------------------------------- queries

/** Team → Diagrams: team-wide diagrams plus diagrams of every workspace the caller can see. */
export const teamDiagramsQuery = (teamId: string) =>
  queryOptions({
    queryKey: ['diagrams', 'team', teamId],
    queryFn: async (): Promise<DiagramSummary[]> => {
      const { data, error } = await supabase
        .from('diagrams')
        .select(SUMMARY)
        .eq('team_id', teamId)
        .order('updated_at', { ascending: false })
      if (error) throw toDataError('load diagrams', error)
      return data
    },
  })

/** Workspace → Diagrams: only diagrams assigned to this workspace. */
export const workspaceDiagramsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['diagrams', 'workspace', workspaceId],
    queryFn: async (): Promise<DiagramSummary[]> => {
      const { data, error } = await supabase
        .from('diagrams')
        .select(SUMMARY)
        .eq('workspace_id', workspaceId)
        .order('updated_at', { ascending: false })
      if (error) throw toDataError('load diagrams', error)
      return data
    },
  })

/** null when the diagram doesn't exist or the caller can't read it. */
export const diagramQuery = (diagramId: string) =>
  queryOptions({
    queryKey: ['diagrams', diagramId],
    queryFn: async (): Promise<Diagram | null> => {
      const { data, error } = await supabase
        .from('diagrams')
        .select(`${SUMMARY}, data`)
        .eq('id', diagramId)
        .maybeSingle()
      if (error) throw toDataError('load the diagram', error)
      return data
    },
  })

// -------------------------------------------------------------- mutations

/** created_by is set by the database (auth.uid()); scope can't change later. */
export async function createDiagram(input: {
  teamId: string
  workspaceId: string | null
  title: string
}): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('diagrams')
    .insert({ team_id: input.teamId, workspace_id: input.workspaceId, title: input.title.trim() })
    .select('id')
    .single()
  if (error) throw toDataError('create the diagram', error, writeErrors)
  return data
}

export async function updateDiagram(diagramId: string, input: { title: string; data: Json }) {
  const { data, error } = await supabase
    .from('diagrams')
    .update({ title: input.title.trim(), data: input.data })
    .eq('id', diagramId)
    .select('id')
  if (error) throw toDataError('save the diagram', error, writeErrors)
  requireAffected(data, 'save diagram')
}

export async function deleteDiagram(diagramId: string) {
  const { data, error } = await supabase.from('diagrams').delete().eq('id', diagramId).select('id')
  if (error) throw toDataError('delete the diagram', error, writeErrors)
  requireAffected(data, 'delete diagram')
}
