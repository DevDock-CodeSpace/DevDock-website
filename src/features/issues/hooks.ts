import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import { workspaceMembersQuery } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import {
  issueKeys,
  labelsQuery,
  setIssueLabels,
  updateIssue,
  type Issue,
  type IssueDetail,
  type IssuePatch,
} from './api'

/**
 * What issue screens need about the current workspace: its members (assignees),
 * labels, and whether the caller manages it (delete issues, manage labels).
 * `canManage` mirrors private.can_manage_workspace() for showing UI only.
 */
export function useIssueContext() {
  const { user } = useAuth()
  const { workspace, can } = useCurrentWorkspace()
  const members = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const labels = useSuspenseQuery(labelsQuery(workspace.id)).data
  return { workspace, members, labels, canManage: can.canEdit, userId: user.id }
}

type UpdateVars = { issue: Pick<Issue, 'id' | 'number'>; patch?: IssuePatch; labelIds?: string[] }

/**
 * Edits an issue (fields and/or labels) optimistically, like Linear: the list
 * and the issue page update at once, and roll back with a toast if the save fails.
 */
export function useUpdateIssue() {
  const queryClient = useQueryClient()
  const { workspace } = useCurrentWorkspace()

  return useMutation({
    mutationFn: async ({ issue, patch, labelIds }: UpdateVars) => {
      if (patch && Object.keys(patch).length > 0) await updateIssue(issue.id, patch)
      if (labelIds) await setIssueLabels(issue.id, labelIds)
    },
    onMutate: async ({ issue, patch, labelIds }) => {
      const listKey = issueKeys.workspace(workspace.id)
      const detailKey = issueKeys.detail(workspace.id, issue.number)
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: detailKey }),
      ])
      const previousList = queryClient.getQueryData<Issue[]>(listKey)
      const previousDetail = queryClient.getQueryData<IssueDetail | null>(detailKey)
      const changes = { ...patch, ...(labelIds ? { labelIds } : {}) }
      queryClient.setQueryData<Issue[]>(listKey, (old) =>
        old?.map((i) => {
          if (i.id !== issue.id) return i
          // The list doesn't hold descriptions.
          const { description: _description, ...rest } = { ...i, ...changes }
          return rest
        }),
      )
      queryClient.setQueryData<IssueDetail | null>(detailKey, (old) => (old ? { ...old, ...changes } : old))
      return { listKey, detailKey, previousList, previousDetail }
    },
    onError: (error, _vars, context) => {
      if (context) {
        queryClient.setQueryData(context.listKey, context.previousList)
        queryClient.setQueryData(context.detailKey, context.previousDetail)
      }
      toast.error(errorMessage(error))
    },
    onSettled: (_data, _error, { issue }) => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.workspace(workspace.id) })
      void queryClient.invalidateQueries({ queryKey: issueKeys.detail(workspace.id, issue.number) })
    },
  })
}
