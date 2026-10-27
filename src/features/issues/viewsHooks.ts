import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import { errorMessage } from '@/lib/errors'
import { FACETS } from './filters'
import {
  createView,
  deleteView,
  addStar,
  starMatches,
  pinMatches,
  pinTarget,
  reorderPins,
  teamPinsQuery,
  unpin,
  updateView,
  viewKeys,
  workspaceViewsQuery,
  type IssuePin,
  type IssueView,
  type StarTarget,
  type PinTarget,
  type ViewPatch,
} from './viewsApi'
import { readViewState, sameViewState, stateOfView, VIEW_PARAM, writeViewState } from './views'

/**
 * The saved view that's open (?v=<id>), the state the URL is in now, and whether that differs from
 * what the view saved. A raw ?v= link (no state of its own) is filled in from the view once.
 */
export function useActiveView() {
  const { workspace } = useCurrentWorkspace()
  const views = useSuspenseQuery(workspaceViewsQuery(workspace.id)).data
  const [params, setParams] = useSearchParams()
  const id = params.get(VIEW_PARAM)
  const view = id ? (views.find((item) => item.id === id) ?? null) : null
  const state = readViewState(params)

  const filledIn = useRef<string | null>(null)
  useEffect(() => {
    if (!view || filledIn.current === view.id) return
    filledIn.current = view.id
    const hasState = ['tab', 'view', ...FACETS].some((key) => params.has(key))
    if (!hasState) setParams((current) => writeViewState(current, stateOfView(view)), { replace: true })
  }, [view, params, setParams])

  return {
    views,
    view,
    /** ?v= points at a view that doesn't exist or isn't shared with you. */
    missing: id !== null && view === null,
    state,
    modified: view !== null && !sameViewState(state, stateOfView(view)),
  }
}

export function useViewMutations() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: viewKeys.all })
  const onError = (error: unknown) => toast.error(errorMessage(error))
  return {
    create: useMutation({ mutationFn: createView, onSuccess: refresh, onError }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: ViewPatch }) => updateView(id, patch), onSuccess: refresh, onError }),
    remove: useMutation({
      mutationFn: (view: Pick<IssueView, 'id'>) => deleteView(view.id),
      // Deleting a view also removes the pins that pointed at it.
      onSuccess: () => Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['issues', 'pins'] })]),
      onError,
    }),
  }
}

/**
 * What you starred in the group, with star / unstar / move. Starring and unstarring show at once
 * (the sidebar's star flips on click) and roll back with a toast if the server says no. A new star
 * gets its id here, and star and unstar run one at a time, so unstarring something starred a moment
 * ago deletes it once it exists instead of being lost.
 */
export function usePins(teamId: string) {
  const queryClient = useQueryClient()
  const key = viewKeys.pins(teamId)
  const pins = useQuery(teamPinsQuery(teamId)).data
  const refresh = () => queryClient.invalidateQueries({ queryKey: key })
  const onError = (error: unknown) => toast.error(errorMessage(error))
  // Optimistic: change the cached list first, put it back on failure.
  const optimistic = (change: (old: IssuePin[]) => IssuePin[]) => async () => {
    await queryClient.cancelQueries({ queryKey: key })
    const previous = queryClient.getQueryData<IssuePin[]>(key)
    queryClient.setQueryData<IssuePin[]>(key, (old = []) => change(old))
    return { previous }
  }
  const rollback = (error: unknown, _vars: unknown, context: { previous?: IssuePin[] } | undefined) => {
    queryClient.setQueryData(key, context?.previous)
    onError(error)
  }

  const pin = useMutation({ mutationFn: ({ workspaceId, target }: { workspaceId: string; target: PinTarget }) => pinTarget(workspaceId, target), onSuccess: refresh, onError })
  const order = { id: `stars:${teamId}` }
  const star = useMutation({
    scope: order,
    mutationFn: ({ target, id }: { target: StarTarget; id: string }) => addStar(teamId, target, id),
    onMutate: ({ target, id }) => optimistic((old) => [...old, newStar(teamId, target, id, old)])(),
    onError: rollback,
    onSettled: refresh,
  })
  const remove = useMutation({
    scope: order,
    mutationFn: (pinId: string) => unpin(pinId),
    onMutate: (pinId) => optimistic((old) => old.filter((item) => item.id !== pinId))(),
    onError: rollback,
    onSettled: refresh,
  })
  const reorder = useMutation({ mutationFn: (ids: string[]) => reorderPins(teamId, ids), onSuccess: refresh, onError })

  return {
    pins: pins ?? [],
    pin,
    remove,
    reorder,
    find: (workspaceId: string, target: PinTarget) => (pins ?? []).find((item) => pinMatches(item, workspaceId, target)) ?? null,
    star: (target: StarTarget) => star.mutate({ target, id: crypto.randomUUID() }),
    findStar: (target: StarTarget) => (pins ?? []).find((item) => starMatches(item, target)) ?? null,
  }
}

/** The row a new star will be, shown until the refetch brings the server's (same id). */
function newStar(teamId: string, target: StarTarget, id: string, old: IssuePin[]): IssuePin {
  return {
    id,
    user_id: '',
    team_id: teamId,
    kind: target.kind,
    workspace_id: target.kind === 'workspace' ? target.workspaceId : null,
    issue_id: target.kind === 'issue' ? target.issueId : null,
    plan_id: target.kind === 'plan' ? target.planId : null,
    view_id: null,
    person_id: null,
    tab: null,
    cycle_id: null,
    position: Math.max(0, ...old.map((item) => item.position)) + 1,
    created_at: new Date().toISOString(),
  }
}
