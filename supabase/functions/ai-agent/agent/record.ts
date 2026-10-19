// A record of each request, kept in ai_requests (see its migration). Written with the
// service role, pinned to the verified user id; a failure here never fails the request.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { logEvent } from './log.ts'
import type { AiAgentResponse, AiExecutionContext, AiToolResult } from './types.ts'

export type RecordedStep = { tool: string; phase: 'execute' | 'prepare'; args: unknown; success: boolean; code?: string; result?: string }

/** A tool result is for debugging, not an archive: cut it short. */
const RESULT_CHARS = 2000

export function recordStep(tool: string, phase: RecordedStep['phase'], args: unknown, result: AiToolResult): RecordedStep {
  const text = JSON.stringify(result.success ? result.data : { message: result.message, details: result.details }) ?? ''
  return { tool, phase, args, success: result.success, code: result.success ? undefined : result.code, result: text.slice(0, RESULT_CHARS) }
}

export async function saveRequest(
  admin: SupabaseClient,
  input: { context: AiExecutionContext; message: string; steps: RecordedStep[]; response: AiAgentResponse; ms: number },
) {
  const { context, response } = input
  try {
    const { error } = await admin.from('ai_requests').insert({
      user_id: context.userId,
      team_id: context.teamId,
      workspace_id: context.workspaceId ?? null,
      request_id: context.requestId,
      message: input.message,
      page: context.currentEntity?.label ?? null,
      time_zone: context.timeZone,
      asked_at: context.currentTime,
      steps: input.steps,
      outcome: response.type,
      reply: response.message,
      ms: input.ms,
    })
    if (error) logEvent(context.requestId, 'record_failed', { code: error.code })
  } catch {
    logEvent(context.requestId, 'record_failed')
  }
}
