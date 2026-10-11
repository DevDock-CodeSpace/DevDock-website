// The agent loop: ask the model, run the tools it picks, hand the results
// back, and stop at an answer, a confirmation, or a limit. It depends on the
// AiProvider interface and the ToolRegistry only: no provider and no feature
// is named here, and adding a tool never changes this file.

import { requiresConfirmation, type PendingActionStore } from '../safety/confirmation.ts'
import type { ToolFilter, ToolRegistry } from '../tools/registry.ts'
import { logEvent } from './log.ts'
import { validate } from './schema.ts'
import type { AiAgentResponse, AiExecutionContext, AiMessage, AiProvider, AiToolCall, AiToolResult } from './types.ts'

export type RunnerLimits = {
  /** Times the model may be asked within one request. */
  maxRounds: number
  /** Tool calls taken from one model turn; the rest are refused. */
  maxCallsPerRound: number
  toolTimeoutMs: number
  /** Characters of the final answer. */
  maxReplyChars: number
  /** Characters of one tool result as JSON. */
  maxResultChars: number
}

export const DEFAULT_LIMITS: RunnerLimits = {
  maxRounds: 6,
  maxCallsPerRound: 4,
  toolTimeoutMs: 15_000,
  maxReplyChars: 4_000,
  maxResultChars: 12_000,
}

const fail = (code: Extract<AiToolResult, { success: false }>['code'], message: string): AiToolResult => ({ success: false, code, message })

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** A tool that returns more than the model should read is a bug in the tool; the model is told to narrow down. */
function bounded(result: AiToolResult, maxChars: number): AiToolResult {
  if (!result.success || JSON.stringify(result.data).length <= maxChars) return result
  return fail('INTERNAL', 'That returned too much to read. Ask for fewer results or add a filter.')
}

type Outcome = { kind: 'result'; result: AiToolResult } | { kind: 'confirmation'; response: Extract<AiAgentResponse, { type: 'confirmation' }> }

export async function runAgent(input: {
  provider: AiProvider
  registry: ToolRegistry
  context: AiExecutionContext
  store: PendingActionStore
  system: string
  history: AiMessage[]
  message: string
  /** Narrows the tools the model is offered (and may call). Everything by default. */
  tools?: ToolFilter
  limits?: Partial<RunnerLimits>
  signal?: AbortSignal
}): Promise<AiAgentResponse> {
  const { provider, registry, context, store, system } = input
  const limits = { ...DEFAULT_LIMITS, ...input.limits }
  const offered = registry.list(input.tools)
  const definitions = offered.map((tool) => tool.definition)
  const allowed = new Set(definitions.map((d) => d.name))
  const messages: AiMessage[] = [...input.history, { role: 'user', text: input.message }]
  const seen = new Map<string, number>()

  async function runCall(call: AiToolCall, modelText: string | null): Promise<Outcome> {
    const tool = allowed.has(call.name) ? registry.get(call.name) : undefined
    if (!tool) return { kind: 'result', result: fail('UNKNOWN_TOOL', `There is no tool called "${call.name}".`) }

    const checked = validate(tool.definition.inputSchema, call.args)
    if (!checked.ok) return { kind: 'result', result: fail('INVALID_ARGUMENTS', checked.errors.join('; ')) }

    // The same call with the same arguments over and over is a loop, not progress.
    const signature = `${call.name}:${JSON.stringify(checked.value)}`
    const repeats = (seen.get(signature) ?? 0) + 1
    seen.set(signature, repeats)
    if (repeats > 2) return { kind: 'result', result: fail('NOT_ALLOWED', 'You already made this exact call. Use its result or ask the user.') }

    const started = Date.now()
    const finish = (result: AiToolResult, phase: 'execute' | 'prepare') => {
      logEvent(context.requestId, 'tool', {
        tool: call.name,
        phase,
        ms: Date.now() - started,
        success: result.success,
        code: result.success ? undefined : result.code,
      })
      return result
    }

    try {
      if (requiresConfirmation(tool.executor)) {
        if (!tool.executor.prepare) return { kind: 'result', result: finish(fail('INTERNAL', 'That action is not available.'), 'prepare') }
        const prepared = await withTimeout(tool.executor.prepare(checked.value, context), limits.toolTimeoutMs)
        if (prepared === 'timeout') return { kind: 'result', result: finish(fail('TIMEOUT', 'That took too long.'), 'prepare') }
        finish(prepared, 'prepare')
        if (!prepared.success) return { kind: 'result', result: prepared }

        const pending = await store.create({
          userId: context.userId,
          teamId: context.teamId,
          workspaceId: context.workspaceId ?? null,
          toolName: call.name,
          args: prepared.data.args,
        })
        const args = (prepared.data.args ?? {}) as Record<string, unknown>
        return {
          kind: 'confirmation',
          response: {
            type: 'confirmation',
            message: modelText?.trim() || `${prepared.data.preview.title}?`,
            pendingActionId: pending.id,
            expiresAt: pending.expiresAt,
            preview: prepared.data.preview,
            editable: (tool.executor.editable ?? []).map((field) => ({
              ...field,
              value: typeof args[field.name] === 'string' ? (args[field.name] as string) : '',
            })),
          },
        }
      }

      const result = await withTimeout(tool.executor.execute(checked.value, context), limits.toolTimeoutMs)
      if (result === 'timeout') return { kind: 'result', result: finish(fail('TIMEOUT', 'That took too long.'), 'execute') }
      return { kind: 'result', result: bounded(finish(result, 'execute'), limits.maxResultChars) }
    } catch (error) {
      // Never the raw error: it can carry SQL or internals the model would repeat to the person.
      console.error(`[ai-agent] ${context.requestId} tool ${call.name} threw`, error instanceof Error ? error.message : error)
      return { kind: 'result', result: finish(fail('INTERNAL', 'Something went wrong while doing that.'), 'execute') }
    }
  }

  for (let round = 1; round <= limits.maxRounds; round++) {
    const reply = await provider.run({ system, messages, tools: definitions, signal: input.signal })
    logEvent(context.requestId, 'round', { round, provider: provider.name, model: provider.model, calls: reply.toolCalls.length })

    if (reply.toolCalls.length === 0) {
      const text = reply.text?.trim()
      if (!text) return { type: 'error', code: 'empty_reply', message: 'I couldn’t work out an answer to that. Try asking another way.' }
      return { type: 'message', message: text.slice(0, limits.maxReplyChars) }
    }

    messages.push({ role: 'assistant', text: reply.text ?? undefined, toolCalls: reply.toolCalls, providerData: reply.providerData })
    const results: { callId: string; name: string; result: AiToolResult }[] = []
    for (const [index, call] of reply.toolCalls.entries()) {
      if (index >= limits.maxCallsPerRound) {
        results.push({ callId: call.id, name: call.name, result: fail('NOT_ALLOWED', 'Too many calls at once. Make this one again.') })
        continue
      }
      const outcome = await runCall(call, reply.text)
      // A confirmation ends the request: nothing after it may run until the person has answered.
      if (outcome.kind === 'confirmation') return outcome.response
      results.push({ callId: call.id, name: call.name, result: outcome.result })
    }
    messages.push({ role: 'tool', results })
  }

  logEvent(context.requestId, 'round_limit', { rounds: limits.maxRounds })
  return {
    type: 'error',
    code: 'too_many_steps',
    message: 'That needed more steps than I can take in one go. Try asking for one thing at a time.',
  }
}
