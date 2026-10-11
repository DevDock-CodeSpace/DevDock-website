// The framework on its own: registry, argument validation, confirmation and
// the agent loop. No database, no network, no model.

import { runAgent } from '../agent/runner.ts'
import { validate } from '../agent/schema.ts'
import { confirmPendingAction, memoryPendingStore, PENDING_TTL_MS, requiresConfirmation } from '../safety/confirmation.ts'
import { ToolRegistry } from '../tools/registry.ts'
import { assert, assertEquals, assertRejects, call, echoTool, notifyTool, say, scriptedProvider, TEAM, testContext, USER } from './helpers.ts'

const SYSTEM = 'test'

// ---------------------------------------------------------------- registry

Deno.test('registry: registers tools and lists them by domain, capability and risk', () => {
  const registry = new ToolRegistry().register([echoTool('one'), echoTool('two')], notifyTool())
  assertEquals(registry.list().map((t) => t.definition.name), ['one', 'two', 'notify'])
  assertEquals(registry.list({ capability: 'send' }).map((t) => t.definition.name), ['notify'])
  assertEquals(registry.list({ risk: ['read'] }).length, 2)
  assertEquals(registry.list({ domain: 'issues' }).length, 0)
})

Deno.test('registry: a repeated or malformed name fails at registration', async () => {
  await assertRejects(() => new ToolRegistry().register(echoTool('same'), echoTool('same')))
  await assertRejects(() => new ToolRegistry().register(echoTool('Not Snake')))
})

Deno.test('registry: the model sees definitions only, never the executor', () => {
  const [definition] = new ToolRegistry().register(notifyTool()).definitions()
  assertEquals(Object.keys(definition).sort(), ['description', 'inputSchema', 'name'])
})

// -------------------------------------------------------------- validation

Deno.test('validation: trims, drops unknown keys, and reports what is wrong', () => {
  const schema = {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      day: { type: 'string', format: 'date' },
      level: { type: 'string', enum: ['low', 'high'] },
      count: { type: 'integer', minimum: 1, maximum: 5 },
      tags: { type: 'array', items: { type: 'string', maxLength: 5 }, maxItems: 2 },
    },
    required: ['id'],
  } as const
  const good = validate(schema, { id: ` ${USER} `, day: '2026-10-12', level: 'high', count: 2, tags: ['a'], extra: 'x', unset: null })
  assertEquals(good, { ok: true, value: { id: USER, day: '2026-10-12', level: 'high', count: 2, tags: ['a'] } })

  for (const bad of [{}, { id: 'nope' }, { id: USER, day: '2026-02-30' }, { id: USER, level: 'mid' }, { id: USER, count: 9 }, { id: USER, tags: ['a', 'b', 'c'] }, { id: USER, tags: ['toolong'] }, 'text']) {
    assert(!validate(schema, bad).ok, `should be refused: ${JSON.stringify(bad)}`)
  }
})

// ------------------------------------------------------------ confirmation

Deno.test('policy: confirmation follows risk, and a tool can only add it', () => {
  assertEquals(requiresConfirmation({ risk: 'read' }), false)
  assertEquals(requiresConfirmation({ risk: 'write' }), false)
  assertEquals(requiresConfirmation({ risk: 'external' }), true)
  assertEquals(requiresConfirmation({ risk: 'destructive' }), true)
  assertEquals(requiresConfirmation({ risk: 'write', confirm: true }), true)
  assertEquals(requiresConfirmation({ risk: 'external', confirm: false }), true)
})

// -------------------------------------------------------------- agent loop

Deno.test('loop: a plain answer needs no tool', async () => {
  const response = await runAgent({
    provider: scriptedProvider([say('Hello.')]),
    registry: new ToolRegistry().register(echoTool()),
    context: testContext(),
    store: memoryPendingStore(),
    system: SYSTEM,
    history: [],
    message: 'hi',
  })
  assertEquals(response, { type: 'message', message: 'Hello.' })
})

Deno.test('loop: runs several tools across rounds and hands results back to the model', async () => {
  const calls: unknown[] = []
  const provider = scriptedProvider([call('echo', { text: 'a' }), call('echo', { text: 'b' }), say('Done.')])
  const response = await runAgent({
    provider,
    registry: new ToolRegistry().register(echoTool('echo', calls)),
    context: testContext(),
    store: memoryPendingStore(),
    system: SYSTEM,
    history: [{ role: 'user', text: 'earlier' }, { role: 'assistant', text: 'reply' }],
    message: 'go',
  })
  assertEquals(response, { type: 'message', message: 'Done.' })
  assertEquals(calls, [{ text: 'a' }, { text: 'b' }])
  assertEquals(provider.inputs.length, 3)
  // History first, then the new message, then each assistant turn with its results.
  assertEquals(provider.inputs[2].messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'tool', 'assistant', 'tool'])
  const last = provider.inputs[2].messages.at(-1)
  assert(last?.role === 'tool' && last.results[0].result.success)
})

Deno.test('loop: an unknown tool and bad arguments come back as errors, and nothing runs', async () => {
  const calls: unknown[] = []
  const provider = scriptedProvider([call('run_sql', { q: 'select 1' }), call('echo', { text: 'x'.repeat(50) }), say('Sorry.')])
  await runAgent({
    provider,
    registry: new ToolRegistry().register(echoTool('echo', calls)),
    context: testContext(),
    store: memoryPendingStore(),
    system: SYSTEM,
    history: [],
    message: 'go',
  })
  assertEquals(calls, [])
  const codes = provider.inputs[2].messages.flatMap((m) => (m.role === 'tool' ? m.results.map((r) => (r.result.success ? 'ok' : r.result.code)) : []))
  assertEquals(codes, ['UNKNOWN_TOOL', 'INVALID_ARGUMENTS'])
})

Deno.test('loop: a tool outside the offered subset cannot be called', async () => {
  const sent: { text: string }[] = []
  const provider = scriptedProvider([call('notify', { text: 'hi' }), say('ok')])
  const store = memoryPendingStore()
  await runAgent({
    provider,
    registry: new ToolRegistry().register(echoTool(), notifyTool(sent)),
    context: testContext(),
    store,
    system: SYSTEM,
    history: [],
    message: 'go',
    tools: { risk: 'read' },
  })
  assertEquals(provider.inputs[0].tools.map((t) => t.name), ['echo'])
  assertEquals(store.rows.size, 0)
  assertEquals(sent, [])
})

Deno.test('loop: stops after the round limit', async () => {
  let n = 0
  const response = await runAgent({
    provider: scriptedProvider([() => call('echo', { text: String(n++) })]),
    registry: new ToolRegistry().register(echoTool()),
    context: testContext(),
    store: memoryPendingStore(),
    system: SYSTEM,
    history: [],
    message: 'go',
    limits: { maxRounds: 3 },
  })
  assertEquals(n, 3)
  assert(response.type === 'error' && response.code === 'too_many_steps')
})

Deno.test('loop: the same call repeated is refused the third time', async () => {
  const calls: unknown[] = []
  const provider = scriptedProvider([call('echo', { text: 'a' }), call('echo', { text: 'a' }), call('echo', { text: 'a' }), say('ok')])
  await runAgent({
    provider,
    registry: new ToolRegistry().register(echoTool('echo', calls)),
    context: testContext(),
    store: memoryPendingStore(),
    system: SYSTEM,
    history: [],
    message: 'go',
  })
  assertEquals(calls.length, 2)
})

Deno.test('loop: a tool that throws or hangs becomes a structured error', async () => {
  const registry = new ToolRegistry().register(
    { ...echoTool('boom'), executor: { risk: 'read', execute: () => Promise.reject(new Error('relation "secret" does not exist')) } },
    { ...echoTool('slow'), executor: { risk: 'read', execute: () => new Promise(() => {}) } },
  )
  const provider = scriptedProvider([call('boom'), call('slow'), say('ok')])
  await runAgent({ provider, registry, context: testContext(), store: memoryPendingStore(), system: SYSTEM, history: [], message: 'go', limits: { toolTimeoutMs: 20 } })
  const results = provider.inputs[2].messages.flatMap((m) => (m.role === 'tool' ? m.results.map((r) => r.result) : []))
  assertEquals(results.map((r) => (r.success ? 'ok' : r.code)), ['INTERNAL', 'TIMEOUT'])
  assert(!JSON.stringify(results).includes('secret'), 'raw errors must not reach the model')
})

Deno.test('confirmation: an external tool is prepared, not run', async () => {
  const sent: { text: string }[] = []
  const store = memoryPendingStore()
  const response = await runAgent({
    provider: scriptedProvider([call('notify', { text: 'I will be late' }, 'Ready to send:')]),
    registry: new ToolRegistry().register(notifyTool(sent)),
    context: testContext(),
    store,
    system: SYSTEM,
    history: [],
    message: 'tell them',
  })
  assertEquals(sent, [])
  assert(response.type === 'confirmation')
  assertEquals(response.message, 'Ready to send:')
  assertEquals(response.preview.body, 'I will be late')
  assertEquals(response.editable, [{ name: 'text', label: 'Message', maxLength: 50, value: 'I will be late' }])
  assertEquals(store.rows.get(response.pendingActionId)?.toolName, 'notify')
})

async function prepared(sent: { text: string; key?: string }[], now: () => number = Date.now) {
  const store = memoryPendingStore(now)
  const registry = new ToolRegistry().register(notifyTool(sent))
  const response = await runAgent({
    provider: scriptedProvider([call('notify', { text: 'hello' })]),
    registry,
    context: testContext(),
    store,
    system: SYSTEM,
    history: [],
    message: 'go',
  })
  assert(response.type === 'confirmation')
  return { store, registry, id: response.pendingActionId }
}

Deno.test('confirmation: confirming runs it once, with the action id as the idempotency key', async () => {
  const sent: { text: string; key?: string }[] = []
  const { store, registry, id } = await prepared(sent)
  const first = await confirmPendingAction({ store, registry, context: testContext(), pendingActionId: id })
  assert(first.result.success)
  assertEquals(sent, [{ text: 'hello', key: id }])

  const replay = await confirmPendingAction({ store, registry, context: testContext(), pendingActionId: id })
  assert(!replay.result.success && replay.result.code === 'ALREADY_EXECUTED')
  assertEquals(sent.length, 1)
})

Deno.test('confirmation: two confirmations at once send once', async () => {
  const sent: { text: string }[] = []
  const { store, registry, id } = await prepared(sent)
  const both = await Promise.all([
    confirmPendingAction({ store, registry, context: testContext(), pendingActionId: id }),
    confirmPendingAction({ store, registry, context: testContext(), pendingActionId: id }),
  ])
  assertEquals(both.filter((b) => b.result.success).length, 1)
  assertEquals(sent.length, 1)
})

Deno.test('confirmation: expired, someone else’s, another group’s and unknown ids all fail', async () => {
  const sent: { text: string }[] = []
  let clock = Date.parse('2026-10-12T15:00:00Z')
  const { store, registry, id } = await prepared(sent, () => clock)

  const other = await confirmPendingAction({ store, registry, context: testContext({ userId: TEAM }), pendingActionId: id, now: () => clock })
  assert(!other.result.success && other.result.code === 'NOT_FOUND')
  const otherGroup = await confirmPendingAction({ store, registry, context: testContext({ teamId: USER }), pendingActionId: id, now: () => clock })
  assert(!otherGroup.result.success && otherGroup.result.code === 'NOT_FOUND')
  const unknown = await confirmPendingAction({ store, registry, context: testContext(), pendingActionId: crypto.randomUUID(), now: () => clock })
  assert(!unknown.result.success && unknown.result.code === 'NOT_FOUND')

  clock += PENDING_TTL_MS + 1
  const late = await confirmPendingAction({ store, registry, context: testContext(), pendingActionId: id, now: () => clock })
  assert(!late.result.success && late.result.code === 'EXPIRED')
  assertEquals(sent, [])
})

Deno.test('confirmation: only declared fields can be edited, and edits are re-validated', async () => {
  const sent: { text: string }[] = []
  const first = await prepared(sent)
  // `tool` and unknown keys in the edits are ignored: the stored tool and arguments stand.
  const edited = await confirmPendingAction({ ...first, context: testContext(), pendingActionId: first.id, edits: { text: 'edited', tool: 'run_sql', to: 'x' } })
  assert(edited.result.success)
  assertEquals(sent.map((s) => s.text), ['edited'])

  const second = await prepared(sent)
  const empty = await confirmPendingAction({ ...second, context: testContext(), pendingActionId: second.id, edits: { text: '   ' } })
  assert(!empty.result.success && empty.result.code === 'INVALID_ARGUMENTS')
  assertEquals(sent.length, 1)
  // A refused edit doesn't use the action up.
  assert(second.store.rows.get(second.id)?.executedAt === null)
})
