import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { workspaceReposQuery } from '@/features/repos/api'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import { workspaceMembersQuery } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import {
  createIssueBranch,
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
 * labels, cycles, linked repos, and whether the caller manages it (delete issues, manage labels and cycles).
 * `canManage` mirrors private.can_manage_workspace() for showing UI only.
 */
export function useIssueContext() {
  const { user } = useAuth()
  const { workspace, can } = useCurrentWorkspace()
  const members = useSuspenseQuery(workspaceMembersQuery(workspace.id)).data
  const labels = useSuspenseQuery(labelsQuery(workspace.id)).data
  const cycles = useSuspenseQuery(cyclesQuery(workspace.id)).data
  const repos = useSuspenseQuery(workspaceReposQuery(workspace.id)).data
  return { workspace, members, labels, cycles, repos, canManage: can.canEdit, userId: user.id }
}

type UpdateVars = { issue: Pick<Issue, 'id' | 'number'>; patch?: IssuePatch; labelIds?: string[] }

/**
 * Creates the issue's branch on GitHub (its repo, or the project's only one).
 * Toasts the result; a no-op if the issue already has its branch.
 */
export function useCreateIssueBranch() {
  const queryClient = useQueryClient()
  const { workspace } = useCurrentWorkspace()
  return useMutation({
    mutationFn: (issue: Pick<Issue, 'id' | 'number'>) => createIssueBranch(issue.id),
    onSuccess: ({ branch, created }) => {
      if (created) toast.success(`Created branch ${branch.name}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: (_data, _error, issue) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: issueKeys.branches(issue.id) }),
        queryClient.invalidateQueries({ queryKey: issueKeys.activity(issue.id) }),
        // The project's only repo may have become the issue's repo.
        queryClient.invalidateQueries({ queryKey: issueKeys.detail(workspace.id, issue.number) }),
        queryClient.invalidateQueries({ queryKey: issueKeys.workspace(workspace.id) }),
      ]),
  })
}

/**
 * Edits an issue (fields and/or labels) optimistically, like Linear: the list
 * and the issue page update at once, and roll back with a toast if the save fails.
 * Moving an issue into In Progress also creates its branch, when the project has repos.
 */
export function useUpdateIssue() {
  const queryClient = useQueryClient()
  const { workspace } = useCurrentWorkspace()
  const createBranch = useCreateIssueBranch()

  return useMutation({
    // One save at a time per workspace, in the order they were made, so an older
    // edit can't land on top of a newer one (optimistic updates still apply at once).
    scope: { id: `issues:${workspace.id}` },
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
        // The description saves itself (IssueDescription); don't undo it here.
        queryClient.setQueryData<IssueDetail | null>(context.detailKey, (current) =>
          context.previousDetail && current
            ? { ...context.previousDetail, description: current.description }
            : context.previousDetail,
        )
      }
      toast.error(errorMessage(error))
    },
    onSuccess: (_data, { issue, patch }, context) => {
      const before =
        context?.previousDetail?.status ?? context?.previousList?.find((i) => i.id === issue.id)?.status
      const hasRepos = (queryClient.getQueryData(workspaceReposQuery(workspace.id).queryKey)?.length ?? 0) > 0
      if (patch?.status === 'in_progress' && before !== 'in_progress' && hasRepos) createBranch.mutate(issue)
    },
    onSettled: (_data, _error, { issue }) => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.workspace(workspace.id) })
      void queryClient.invalidateQueries({ queryKey: issueKeys.detail(workspace.id, issue.number) })
      // The group-wide Issues page.
      void queryClient.invalidateQueries({ queryKey: ['issues', 'team'] })
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
 * The filters, read straight from the URL (so a link, a saved view or a pinned person opens with
 * them, and the back button works). `setFilters` composes with the latest URL, so several quick
 * picks in a row all stick.
 */
export function useIssueFilters() {
  const [params, setParams] = useSearchParams()
  const latest = useRef(params)
  useEffect(() => {
    latest.current = params
  }, [params])
  const filters = useMemo(() => readFilters(params), [params])
  const setFilters = useCallback(
    (update: IssueFilters | ((previous: IssueFilters) => IssueFilters)) => {
      const next = typeof update === 'function' ? update(readFilters(latest.current)) : update
      const nextParams = writeFilters(latest.current, next)
      latest.current = nextParams
      setParams(nextParams, { replace: true })
    },
    [setParams],
  )
  return [filters, setFilters] as const
}
