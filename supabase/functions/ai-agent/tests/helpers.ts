// Test doubles: a provider that replays a script, and a context that touches no database.

import { defineTool } from '../tools/registry.ts'
import type { AiExecutionContext, AiProvider, AiProviderInput, AiProviderResponse, AiTool, AiToolResult } from '../agent/types.ts'

export function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

export function assertEquals(actual: unknown, expected: unknown, message?: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${message ?? 'values differ'}\n  actual:   ${a}\n  expected: ${e}`)
}

export async function assertRejects(work: () => unknown, message = 'expected it to throw') {
  try {
    await work()
  } catch {
    return
  }
  throw new Error(message)
}

type Step = AiProviderResponse | ((input: AiProviderInput) => AiProviderResponse)

/** Answers each request with the next scripted step and records what it was sent. */
export function scriptedProvider(steps: Step[]): AiProvider & { inputs: AiProviderInput[] } {
  const inputs: AiProviderInput[] = []
  let next = 0
  return {
    name: 'scripted',
    model: 'test',
    inputs,
    run(input) {
      // The runner keeps appending to the same array; keep what it looked like at this call.
      inputs.push({ ...input, messages: structuredClone(input.messages) })
      const step = steps[Math.min(next++, steps.length - 1)]
      return Promise.resolve(typeof step === 'function' ? step(input) : step)
    },
  }
}

export const say = (text: string): AiProviderResponse => ({ text, toolCalls: [] })
export const call = (name: string, args: unknown = {}, text: string | null = null): AiProviderResponse => ({
  text,
  toolCalls: [{ id: `${name}-${crypto.randomUUID().slice(0, 8)}`, name, args }],
})

export const USER = '11111111-1111-4111-8111-111111111111'
export const TEAM = '22222222-2222-4222-8222-222222222222'

export function testContext(overrides: Partial<AiExecutionContext> = {}): AiExecutionContext {
  return {
    requestId: 'test',
    userId: USER,
    userName: 'Tester',
    teamId: TEAM,
    teamName: 'Test group',
    currentTime: '2026-10-12T15:00:00.000Z',
    timeZone: 'UTC',
    // Unit tests never reach the database; a tool that tries fails loudly.
    db: new Proxy({}, { get: () => { throw new Error('no database in unit tests') } }) as AiExecutionContext['db'],
    callFunction: () => Promise.resolve({ success: false, code: 'INTERNAL', message: 'no functions in unit tests' }),
    ...overrides,
  }
}

/** A read tool that records its calls. */
export function echoTool(name = 'echo', calls: unknown[] = [], result?: AiToolResult): AiTool {
  return defineTool<{ text?: string }>({
    name,
    description: 'Echoes text.',
    domain: 'test',
    capability: 'get',
    risk: 'read',
    inputSchema: { type: 'object', properties: { text: { type: 'string', maxLength: 20 } } },
    execute: (args) => {
      calls.push(args)
      return Promise.resolve(result ?? { success: true, data: { echoed: args.text ?? null } })
    },
  })
}

/** An external tool: prepared first, run only on confirmation. */
export function notifyTool(sent: { text: string; key?: string }[] = []): AiTool {
  return defineTool<{ text: string }>({
    name: 'notify',
    description: 'Sends a notice to someone.',
    domain: 'test',
    capability: 'send',
    risk: 'external',
    inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 50 } }, required: ['text'] },
    editable: [{ name: 'text', label: 'Message', maxLength: 50 }],
    prepare: (args) => Promise.resolve({ success: true, data: { args, preview: { title: 'Send notice', body: args.text, confirmLabel: 'Send' } } }),
    execute: (args, context) => {
      sent.push({ text: args.text, key: context.idempotencyKey })
      return Promise.resolve({ success: true, data: { sent: true } })
    },
    confirmedMessage: () => 'Sent.',
  })
}
