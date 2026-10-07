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
  pinMatches,
  pinTarget,
  reorderPins,
  teamPinsQuery,
  unpin,
  updateView,
  viewKeys,
  workspaceViewsQuery,
  type IssueView,
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

/** Your pins for the group, with toggle / unpin / move. */
export function usePins(teamId: string) {
  const queryClient = useQueryClient()
  const pins = useQuery(teamPinsQuery(teamId)).data
  const refresh = () => queryClient.invalidateQueries({ queryKey: viewKeys.pins(teamId) })
  const onError = (error: unknown) => toast.error(errorMessage(error))

  const pin = useMutation({ mutationFn: ({ workspaceId, target }: { workspaceId: string; target: PinTarget }) => pinTarget(workspaceId, target), onSuccess: refresh, onError })
  const remove = useMutation({ mutationFn: (pinId: string) => unpin(pinId), onSuccess: refresh, onError })
  const reorder = useMutation({ mutationFn: (ids: string[]) => reorderPins(teamId, ids), onSuccess: refresh, onError })

  return {
    pins: pins ?? [],
    pin,
    remove,
    reorder,
    find: (workspaceId: string, target: PinTarget) => (pins ?? []).find((item) => pinMatches(item, workspaceId, target)) ?? null,
  }
}
