import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { createPlan, deletePlan, planKeys, planWhiteboard, updatePlan, type Plan, type PlanDetail, type PlanPatch } from './api'

/** New plan (with its folder, Brief and Whiteboard in Files). Resolves to the plan's id. */
export function useCreatePlan(teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createPlan(teamId, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.team(teamId) })
      // Its folder, Brief and Whiteboard are new in Files.
      void queryClient.invalidateQueries({ queryKey: ['documents', 'team', teamId] })
      void queryClient.invalidateQueries({ queryKey: ['documents', 'folders', teamId] })
      void queryClient.invalidateQueries({ queryKey: ['diagrams', 'team', teamId] })
    },
  })
}

/** Optimistic: the list and the open plan change at once, and roll back with a toast if the save fails. */
export function useUpdatePlan(teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ planId, patch }: { planId: string; patch: PlanPatch }) => updatePlan(planId, patch),
    onMutate: async ({ planId, patch }) => {
      await queryClient.cancelQueries({ queryKey: planKeys.all })
      const list = queryClient.getQueryData<Plan[]>(planKeys.team(teamId))
      const detail = queryClient.getQueryData<PlanDetail | null>(planKeys.detail(planId))
      const { description: _description, ...listPatch } = patch
      queryClient.setQueryData<Plan[]>(planKeys.team(teamId), (old) => old?.map((p) => (p.id === planId ? { ...p, ...listPatch } : p)))
      if (detail) queryClient.setQueryData<PlanDetail>(planKeys.detail(planId), { ...detail, ...patch })
      return { list, detail }
    },
    onError: (error, { planId }, context) => {
      queryClient.setQueryData(planKeys.team(teamId), context?.list)
      if (context?.detail) queryClient.setQueryData(planKeys.detail(planId), context.detail)
      toast.error(errorMessage(error))
    },
    onSettled: (_data, _error, { planId, patch }) => {
      void queryClient.invalidateQueries({ queryKey: planKeys.team(teamId) })
      void queryClient.invalidateQueries({ queryKey: planKeys.detail(planId) })
      // A renamed plan renames its folder.
      if (patch.name !== undefined) void queryClient.invalidateQueries({ queryKey: ['documents', 'folders', teamId] })
    },
  })
}

/** The plan's whiteboard, made on first open. Resolves to its id. */
export function useOpenPlanWhiteboard(teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (planId: string) => planWhiteboard(planId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.team(teamId) })
      void queryClient.invalidateQueries({ queryKey: ['diagrams', 'team', teamId] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}

/** Deletes the plan and its folder's files; its issues lose the plan, so the issue lists refetch too. */
export function useDeletePlan(teamId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (planId: string) => deletePlan(teamId, planId),
    onSuccess: (_data, planId) => {
      queryClient.setQueryData<Plan[]>(planKeys.team(teamId), (old) => old?.filter((p) => p.id !== planId))
      void queryClient.invalidateQueries({ queryKey: planKeys.team(teamId) })
      void queryClient.invalidateQueries({ queryKey: ['issues', 'team'] })
      void queryClient.invalidateQueries({ queryKey: ['issues', 'workspace'] })
      void queryClient.invalidateQueries({ queryKey: ['issues', 'pins'] })
      void queryClient.invalidateQueries({ queryKey: ['documents', 'team', teamId] })
      void queryClient.invalidateQueries({ queryKey: ['documents', 'folders', teamId] })
      void queryClient.invalidateQueries({ queryKey: ['diagrams', 'team', teamId] })
    },
  })
}
