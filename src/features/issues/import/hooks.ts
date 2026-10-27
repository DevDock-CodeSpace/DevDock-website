import { useMutation, useQueryClient } from '@tanstack/react-query'
import { issueKeys } from '../api'
import { planKeys } from '@/features/plans/api'
import { importIssues, importPeopleQuery, mapImportAssignee, type FilePerson, type FilePlan, type ImportedIssue } from './api'
import type { ImportSource } from './fields'
import type { FileSprint } from './values'

/**
 * One request for the whole file. Afterwards the project's list, who the file's people are, its
 * labels and sprints (when some were created) and the group-wide list are refetched; the realtime
 * burst that follows in other tabs is batched by lib/realtime into the same few refetches.
 */
export function useImportIssues(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ source, issues, sprints, people, plans }: { source: ImportSource; issues: ImportedIssue[]; sprints: FileSprint[]; people: FilePerson[]; plans: FilePlan[] }) =>
      importIssues(workspaceId, source, issues, sprints, people, plans),
    onSuccess: (result, { people }) => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.workspace(workspaceId) })
      void queryClient.invalidateQueries({ queryKey: ['issues', 'team'] })
      if (people.length > 0) void queryClient.invalidateQueries({ queryKey: importPeopleQuery(workspaceId).queryKey })
      if (result.labels_created > 0) void queryClient.invalidateQueries({ queryKey: issueKeys.labels(workspaceId) })
      if (result.sprints_created > 0) void queryClient.invalidateQueries({ queryKey: issueKeys.cycles(workspaceId) })
      if (result.plans_created > 0) void queryClient.invalidateQueries({ queryKey: planKeys.all })
    },
  })
}

/** Maps an imported name to a person (one request); the mapping and, when issues were assigned, the lists refetch. */
export function useMapImportAssignee(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, userId }: { name: string; userId: string | null }) => mapImportAssignee(workspaceId, name, userId),
    onSuccess: (assigned) => {
      void queryClient.invalidateQueries({ queryKey: importPeopleQuery(workspaceId).queryKey })
      if (assigned > 0) {
        void queryClient.invalidateQueries({ queryKey: issueKeys.workspace(workspaceId) })
        void queryClient.invalidateQueries({ queryKey: ['issues', 'team'] })
      }
    },
  })
}
