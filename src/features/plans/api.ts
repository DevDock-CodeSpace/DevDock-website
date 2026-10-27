import { queryOptions } from '@tanstack/react-query'
import { removeDocImages } from '@/features/docs/api'
import { requireAffected, toDataError } from '@/lib/errors'
import { SETTLED_STALE_MS } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/types/database.types'

// Plans (docs/ISSUES_HUB_PLAN.md): goals in a group, assigned to issues like a label, with a page.
// Everyone in the group reads them and anyone creates one; its lead, its creator and group
// owners/admins edit and delete (RLS).

export type PlanStatus = Database['public']['Enums']['plan_status']

export type Plan = {
  id: string
  team_id: string
  name: string
  status: PlanStatus
  lead_id: string | null
  starts_on: string | null
  target_on: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  /** Its folder in Files (Plans / <name>), its Brief doc and its Whiteboard (made on first open for imported plans). */
  folder_id: string | null
  brief_id: string | null
  whiteboard_id: string | null
  /** Lists only: the start of its Brief (public.brief_excerpt, computed in the same request; up to 160 characters). */
  brief_excerpt?: string | null
}
/** One plan, with the start of its Brief (only its page needs it). */
export type PlanDetail = Plan & { description: Json | null; brief: { content: string; updated_at: string } | null }

export const planKeys = {
  all: ['plans'] as const,
  team: (teamId: string) => ['plans', 'team', teamId] as const,
  detail: (planId: string) => ['plans', 'detail', planId] as const,
}

const PLAN_COLUMNS = 'id, team_id, name, status, lead_id, starts_on, target_on, created_by, created_at, updated_at, folder_id, brief_id, whiteboard_id'

/** Every plan in the group (small: one request; lists, pickers and chips all read it). */
export const teamPlansQuery = (teamId: string) =>
  queryOptions({
    queryKey: planKeys.team(teamId),
    staleTime: SETTLED_STALE_MS,
    queryFn: async (): Promise<Plan[]> => {
      // brief_excerpt is a computed column the generated types can't see, hence returns<>().
      const { data, error } = await supabase
        .from('plans')
        .select(`${PLAN_COLUMNS}, brief_excerpt`)
        .eq('team_id', teamId)
        .order('name')
        .returns<Plan[]>()
      if (error) throw toDataError('load plans', error)
      return data
    },
  })

/** null when the plan doesn't exist or isn't in a group the caller is in. */
export const planQuery = (planId: string) =>
  queryOptions({
    queryKey: planKeys.detail(planId),
    queryFn: async (): Promise<PlanDetail | null> => {
      // The Brief's text comes along (one request); RLS decides whether the caller may read it.
      const { data, error } = await supabase
        .from('plans')
        .select(`${PLAN_COLUMNS}, description, brief:documents!plans_brief_id_fkey(content, updated_at)`)
        .eq('id', planId)
        .maybeSingle()
      if (error) throw toDataError('load the plan', error)
      return data
    },
  })

const writeErrors = {
  '23505': 'There is already a plan with that name.',
  '23514': 'Give the plan a name of up to 120 characters, a lead from this group, and a target after its start.',
  '42501': 'Only the plan’s lead, whoever created it, and group owners/admins can change it.',
}

type PlanInput = { name: string; status?: PlanStatus; lead_id?: string | null; starts_on?: string | null; target_on?: string | null }

/** New plan: the plan with its folder in Files, its Brief and its Whiteboard, in one call. Returns its id. */
export async function createPlan(teamId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_plan', { p_team_id: teamId, p_name: name.trim() })
  if (error) throw toDataError('create the plan', error, writeErrors)
  return data
}

/** The plan's whiteboard, made the first time someone opens it (imported plans start without one). */
export async function planWhiteboard(planId: string): Promise<string> {
  const { data, error } = await supabase.rpc('plan_whiteboard', { p_plan_id: planId })
  if (error) throw toDataError('open the whiteboard', error)
  return data
}

/** What deleting the plan takes with it (for the warning), and its docs (whose images go first). */
export async function planFiles(planId: string): Promise<{ docIds: string[]; whiteboards: number; folders: number }> {
  const { data, error } = await supabase.rpc('plan_files', { p_plan_id: planId }).single()
  if (error) throw toDataError('load the plan’s files', error)
  return { docIds: data.doc_ids ?? [], whiteboards: data.whiteboards ?? 0, folders: data.folders ?? 0 }
}

export type PlanPatch = Partial<PlanInput & { description: Json | null }>

export async function updatePlan(planId: string, patch: PlanPatch) {
  const update = patch.name === undefined ? patch : { ...patch, name: patch.name.trim() }
  const { data, error } = await supabase.from('plans').update(update).eq('id', planId).select('id')
  if (error) throw toDataError('save the plan', error, writeErrors)
  requireAffected(data, 'update plan')
}

/**
 * Deletes the plan and everything in its folder: first its docs' images (Storage), then the rows in
 * one call. Its issues stay where they are, without a plan.
 */
export async function deletePlan(teamId: string, planId: string) {
  const { docIds } = await planFiles(planId)
  for (const docId of docIds) await removeDocImages(teamId, docId)
  const { error } = await supabase.rpc('delete_plan', { p_plan_id: planId })
  if (error) throw toDataError('delete the plan', error, writeErrors)
}
