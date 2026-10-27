import { queryOptions } from '@tanstack/react-query'
import type { Json } from '@/types/database.types'
import { supabase } from '@/lib/supabase'
import { toDataError } from '@/lib/errors'
import type { ImportRow } from './build'
import type { ImportSource } from './fields'
import type { FileSprint } from './values'

export type ImportedIssue = Omit<ImportRow, 'description'> & { description: Json | null }
export type ImportResult = {
  created: number
  skipped: number
  labels_created: number
  sprints_created: number
  sprints_skipped: number
  plans_created: number
}
/** A project named in the file (Linear's), which becomes a plan of the group. */
export type FilePlan = { ref: string; name: string }
/** A name an imported file used for an assignee, the person it stands for, and the issues still waiting under it. */
export type ImportPerson = { name: string; user_id: string | null; waiting: number }
/** Every assignee name in a file, with whoever the import matched it to (null = kept by name). */
export type FilePerson = { name: string; user_id: string | null }

const importErrors = {
  '42501': 'Only project leads and group owners/admins can import issues.',
  '22023': 'That file is too big to import at once: split it into files of at most 1000 issues.',
  '23514': 'An issue in the file isn’t allowed here: assignees and sprints must belong to this project.',
  '23505': 'Two labels in the file differ only in spaces or case. Rename one and try again.',
}

/**
 * Settings → Import and the import page: who each imported name is mapped to. Not live
 * (issue_import_people isn't published; lib/live NOT_LIVE), so writes here invalidate it.
 */
export const importPeopleQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['issues', 'import-people', workspaceId],
    queryFn: async (): Promise<ImportPerson[]> => {
      const { data, error } = await supabase.rpc('import_people', { p_workspace_id: workspaceId })
      if (error) throw toDataError('load the people from imports', error)
      return data
    },
  })

/** Every row, the sprints and plans they need, and who the file's people are, in one transaction (RPC, under RLS). */
export async function importIssues(
  workspaceId: string,
  source: ImportSource,
  issues: ImportedIssue[],
  sprints: FileSprint[],
  people: FilePerson[],
  plans: FilePlan[],
): Promise<ImportResult> {
  const { data, error } = await supabase.rpc('import_issues', {
    p_workspace_id: workspaceId,
    p_source: source,
    p_issues: issues as unknown as Json,
    p_cycles: sprints as unknown as Json,
    p_people: people as unknown as Json,
    p_plans: plans as unknown as Json,
  })
  if (error) throw toDataError('import the issues', error, importErrors)
  return data as ImportResult
}

/**
 * Maps an imported name to a person (null: back to nobody) and assigns the issues still waiting
 * under it; returns how many were assigned.
 */
export async function mapImportAssignee(workspaceId: string, name: string, userId: string | null): Promise<number> {
  // The generated type can't express the nullable argument the function accepts.
  const { data, error } = await supabase.rpc('map_import_assignee', { p_workspace_id: workspaceId, p_name: name, p_user_id: userId as string })
  if (error) {
    throw toDataError('match the person', error, {
      '42501': 'Only project leads and group owners/admins can match imported people.',
      '23514': 'That person isn’t in this project. Add them to the project first.',
    })
  }
  return data
}
