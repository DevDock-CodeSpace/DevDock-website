import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import { workspaceMembersQuery } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import {
  cyclesQuery,
  issueKeys,
  labelsQuery,
  setIssueLabels,
  updateIssue,
  type Issue,
  type IssueDetail,
  type IssuePatch,
} from './api'
import { readFilters, writeFilters, type IssueFilters } from './filters'

/**
 * What issue screens need about the current workspace: its members (assignees),
 * labels, cycles, and whether the caller manages it (delete issues, manage labels and cycles).
 * `canManage` mirrors private.can_manage_workspace() for showing UI only.
 */
export function useIssueContext() {
  const { user } = useAuth()
  const { workspace, can } = useCurrentWorkspace()
  const members = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const labels = useSuspenseQuery(labelsQuery(workspace.id)).data
  const cycles = useSuspenseQuery(cyclesQuery(workspace.id)).data
  return { workspace, members, labels, cycles, canManage: can.canEdit, userId: user.id }
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
      void queryClient.invalidateQueries({ queryKey: issueKeys.activity(issue.id) })
    },
  })
}

/** List ↔ Board, kept in the URL (?view=board) so it survives reloads and links. */
export function useIssueView() {
  const [params, setParams] = useSearchParams()
  const view: 'list' | 'board' = params.get('view') === 'board' ? 'board' : 'list'
  const setView = (next: 'list' | 'board') =>
    setParams(
      (p) => {
        if (next === 'board') p.set('view', 'board')
        else p.delete('view')
        return p
      },
      { replace: true },
    )
  return [view, setView] as const
}

/**
 * Filters as state (instant, and quick successive picks compose) mirrored into
 * the URL so views can be shared and survive reloads.
 */
export function useIssueFilters() {
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState<IssueFilters>(() => readFilters(params))
  useEffect(() => {
    setParams((p) => writeFilters(p, filters), { replace: true })
  }, [filters, setParams])
  return [filters, setFilters] as const
}
