import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { errorMessage } from '@/lib/errors'
import { pinsQuery, pinWorkspace, unpinWorkspace, type WorkspacePin } from './api'
import { readRecentVisits } from './recent'

/** The caller's pins, plus an instant pin/unpin toggle (rolls back with a toast on failure). */
export function usePins() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const pins = useSuspenseQuery(pinsQuery(user.id)).data
  const key = pinsQuery(user.id).queryKey

  const toggle = useMutation({
    mutationFn: ({ workspaceId, pin }: { workspaceId: string; pin: boolean }) =>
      pin ? pinWorkspace(workspaceId) : unpinWorkspace(user.id, workspaceId),
    onMutate: async ({ workspaceId, pin }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<WorkspacePin[]>(key)
      queryClient.setQueryData<WorkspacePin[]>(key, (old = []) =>
        pin
          ? [...old.filter((p) => p.workspace_id !== workspaceId), { workspace_id: workspaceId, pinned_at: new Date().toISOString() }]
          : old.filter((p) => p.workspace_id !== workspaceId),
      )
      return { previous }
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(errorMessage(error))
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  })

  return {
    pins,
    isPinned: (workspaceId: string) => pins.some((p) => p.workspace_id === workspaceId),
    setPinned: (workspaceId: string, pin: boolean) => toggle.mutate({ workspaceId, pin }),
  }
}

/** When each workspace in the team was last opened in this browser; updates as you move around. */
export function useRecentVisits(teamId: string) {
  const [visits, setVisits] = useState(() => readRecentVisits(teamId))
  useEffect(() => {
    const update = () => setVisits(readRecentVisits(teamId))
    update()
    window.addEventListener('devdock:recent-workspaces', update)
    return () => window.removeEventListener('devdock:recent-workspaces', update)
  }, [teamId])
  return visits
}
