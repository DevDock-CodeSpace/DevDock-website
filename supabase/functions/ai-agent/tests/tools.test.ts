// The tools against a real database: the local Supabase stack, real RLS,
// real triggers and RPCs, one signed-in client per test person. Skipped unless
// tests/run-local.sh supplied the local stack. No model is involved: where the
// agent loop is exercised, the provider is scripted.

import { buildContext } from '../agent/context.ts'
import { runAgent } from '../agent/runner.ts'
import type { AiExecutionContext, AiToolResult } from '../agent/types.ts'
import { confirmPendingAction, supabasePendingStore } from '../safety/confirmation.ts'
import { createToolRegistry } from '../tools/index.ts'
import { assert, assertEquals, call, scriptedProvider } from './helpers.ts'
import { code, createFixture, data, localStack, type Fixture } from './local.ts'

const registry = createToolRegistry()

function run(name: string, args: unknown, context: AiExecutionContext): Promise<AiToolResult> {
  const tool = registry.get(name)
  if (!tool) throw new Error(`no tool ${name}`)
  return tool.executor.execute(args, context)
}

type Issues = { total: number; issues: { identifier: string; title: string; assignee: string | null; status: string }[] }
type Meetings = { meetings: { id: string; title: string }[] }
type Conversations = { conversations: { id: string; kind: string; title: string }[]; note?: string }

Deno.test({
  name: 'tools on the local database',
  ignore: !localStack,
  // supabase-js keeps a realtime timer per client.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const f: Fixture = await createFixture()
    const { owner, kumar, reddy, outsider, alpha, beta } = f
    const messagesIn = async (conversationId: string) => {
      const { count } = await f.admin.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conversationId)
      return count ?? 0
    }

    try {
      // ------------------------------------------------------------ context

      await t.step('context: the user comes from the session, and the group and workspace must be theirs', async () => {
        const base = { requestId: 't', callFunction: f.context(owner).callFunction }
        const mine = await buildContext({ ...base, db: owner.db, userId: owner.id, body: { teamId: f.teamId, workspaceId: alpha.id, userId: kumar.id, timeZone: 'Asia/Kolkata' } })
        assert(mine.ok)
        // A userId in the body is ignored.
        assertEquals(mine.context.userId, owner.id)
        assertEquals(mine.context.userName, 'Zed Owner')
        assertEquals(mine.context.workspaceName, 'Alpha Rocket')
        assertEquals(mine.context.timeZone, 'Asia/Kolkata')

        const notMember = await buildContext({ ...base, db: outsider.db, userId: outsider.id, body: { teamId: f.teamId } })
        assertEquals(notMember, { ok: false, status: 404, code: 'not_found' })
        const hiddenWorkspace = await buildContext({ ...base, db: reddy.db, userId: reddy.id, body: { teamId: f.teamId, workspaceId: alpha.id } })
        assertEquals(hiddenWorkspace, { ok: false, status: 404, code: 'not_found' })
        const badIds = await buildContext({ ...base, db: owner.db, userId: owner.id, body: { teamId: 'x' } })
        assertEquals(badIds, { ok: false, status: 400, code: 'bad_request' })
      })

      await t.step('context: the open page is resolved under RLS, or dropped', async () => {
        const base = { requestId: 't', callFunction: f.context(owner).callFunction }
        const seen = await buildContext({ ...base, db: kumar.db, userId: kumar.id, body: { teamId: f.teamId, currentEntity: { type: 'issue', workspaceId: alpha.id, number: 1 } } })
        assert(seen.ok)
        assertEquals(seen.context.currentEntity?.ref, `${alpha.key}-1`)
        const hidden = await buildContext({ ...base, db: reddy.db, userId: reddy.id, body: { teamId: f.teamId, currentEntity: { type: 'issue', workspaceId: alpha.id, number: 1 } } })
        assert(hidden.ok)
        assertEquals(hidden.context.currentEntity, undefined)
        const meeting = await buildContext({ ...base, db: reddy.db, userId: reddy.id, body: { teamId: f.teamId, currentEntity: { type: 'meeting', id: f.meetings.alpha } } })
        assert(meeting.ok && meeting.context.currentEntity === undefined)
      })

      // ------------------------------------------------------------- people

      await t.step('find_user: names only, several matches are all returned', async () => {
        const both = data<{ people: Record<string, unknown>[] }>(await run('find_user', { name: 'sree' }, f.context(owner)))
        assertEquals(both.people.map((p) => p.name).sort(), ['Sree Kumar', 'Sree Reddy'])
        assertEquals(Object.keys(both.people[0]).sort(), ['id', 'isYou', 'name'])
        const one = data<{ people: { id: string }[] }>(await run('find_user', { name: 'Sree Kumar' }, f.context(owner)))
        assertEquals(one.people.map((p) => p.id), [kumar.id])
        const me = data<{ people: { id: string; isYou: boolean }[] }>(await run('find_user', { name: 'me' }, f.context(reddy)))
        assertEquals(me.people, [{ id: reddy.id, name: 'Sree Reddy', isYou: true }] as unknown as typeof me.people)
        // Someone outside the group is not found, and an outsider sees nobody.
        assertEquals(data<{ people: unknown[] }>(await run('find_user', { name: 'Olive' }, f.context(owner))).people, [])
        assertEquals(data<{ people: unknown[] }>(await run('find_user', { name: 'Sree' }, f.context(outsider))).people, [])
      })

      // ------------------------------------------------------------- issues

      await t.step('search_issues: filters, and only what the caller can see', async () => {
        const login = data<Issues>(await run('search_issues', { query: 'login' }, f.context(owner)))
        assertEquals(login.issues.map((i) => i.title).sort(), ['Fix login redirect', 'Login page styling'])
        const mine = data<Issues>(await run('search_issues', { assignedToMe: true, state: 'open' }, f.context(kumar)))
        assertEquals(mine.issues.map((i) => i.identifier), [`${alpha.key}-1`])
        assertEquals(mine.issues[0].assignee, 'Sree Kumar')
        const closed = data<Issues>(await run('search_issues', { state: 'closed' }, f.context(owner)))
        assertEquals(closed.issues.map((i) => i.title), ['Write release notes'])
        const high = data<Issues>(await run('search_issues', { priority: ['high'], dueBefore: '2026-10-31' }, f.context(owner)))
        assertEquals(high.total, 1)
        const inBeta = data<Issues>(await run('search_issues', { project: 'beta' }, f.context(owner)))
        assertEquals(inBeta.issues.map((i) => i.title), ['Water the plants'])
        const byId = data<Issues>(await run('search_issues', { query: `${alpha.key.toLowerCase()}-2` }, f.context(owner)))
        assertEquals(byId.issues.map((i) => i.title), ['Login page styling'])
        const capped = data<Issues & { note?: string }>(await run('search_issues', { limit: 2 }, f.context(owner)))
        assertEquals([capped.issues.length, capped.total, Boolean(capped.note)], [2, 4, true])

        // Kumar is only in Alpha; Reddy is in no project; a LIKE wildcard is text, not a pattern.
        assertEquals(data<Issues>(await run('search_issues', {}, f.context(kumar))).total, 3)
        assertEquals(data<Issues>(await run('search_issues', { query: 'login' }, f.context(reddy))).total, 0)
        assertEquals(data<Issues>(await run('search_issues', { query: '%' }, f.context(owner))).total, 0)
      })

      await t.step('get_issue: details for those who can open it', async () => {
        const issue = data(await run('get_issue', { issue: `${alpha.key}-1` }, f.context(kumar)))
        assertEquals([issue.title, issue.status, issue.priority, issue.assignee, issue.dueDate, issue.project], ['Fix login redirect', 'Todo', 'high', 'Sree Kumar', '2026-10-14', 'Alpha Rocket'])
        assert(!JSON.stringify(issue).includes(kumar.id), 'no ids in the result')
        assertEquals(code(await run('get_issue', { issue: `${alpha.key}-1` }, f.context(reddy))), 'NOT_FOUND')
        assertEquals(code(await run('get_issue', { issue: `${alpha.key}-999` }, f.context(owner))), 'NOT_FOUND')
        assertEquals(code(await run('get_issue', { issue: 'the login one' }, f.context(owner))), 'INVALID_ARGUMENTS')
      })

      await t.step('create_issue: never guesses the project, and RLS decides who may', async () => {
        const unclear = await run('create_issue', { title: 'Fix mobile navigation' }, f.context(owner))
        assertEquals(code(unclear), 'NEEDS_CLARIFICATION')
        // With one visible project, or an open one, there is nothing to ask.
        const kumarMade = data(await run('create_issue', { title: 'From Kumar', description: 'Line one\nLine two', priority: 'urgent', assignee: 'me', dueDate: '2026-11-01' }, f.context(kumar)))
        assertEquals(kumarMade.project, 'Alpha Rocket')
        const inOpen = data(await run('create_issue', { title: 'In the open project' }, f.context(owner, { workspaceId: beta.id })))
        assertEquals(inOpen.project, 'Beta Garden')
        const named = data(await run('create_issue', { title: 'Named project', project: alpha.key }, f.context(owner)))
        assert(String(named.identifier).startsWith(`${alpha.key}-`))

        const made = data(await run('get_issue', { issue: String(kumarMade.identifier) }, f.context(owner)))
        assertEquals([made.priority, made.assignee, made.dueDate, made.description], ['urgent', 'Sree Kumar', '2026-11-01', 'Line one\nLine two'])
        // The database numbered it and recorded who made it.
        const { data: row } = await f.admin.from('issues').select('created_by, team_id').eq('workspace_id', alpha.id).eq('title', 'From Kumar').single()
        assertEquals(row, { created_by: kumar.id, team_id: f.teamId })

        assertEquals(code(await run('create_issue', { title: 'No access', project: 'Alpha Rocket' }, f.context(reddy))), 'NOT_FOUND')
        assertEquals(code(await run('create_issue', { title: 'x', project: 'nonexistent' }, f.context(owner))), 'NOT_FOUND')
        assertEquals(code(await run('create_issue', { title: 'x', project: alpha.key, labels: ['bug'] }, f.context(owner))), 'NOT_FOUND')
        // Someone who isn't in the project can't be the assignee (check_issue).
        assertEquals(code(await run('create_issue', { title: 'x', project: alpha.key, assignee: reddy.id }, f.context(owner))), 'NOT_ALLOWED')
      })

      await t.step('update_issue: the same rules as the app', async () => {
        const id = `${alpha.key}-2`
        const assigned = data(await run('update_issue', { issue: id, assignee: kumar.id, priority: 'low', dueDate: '2026-12-01' }, f.context(owner)))
        assertEquals([assigned.assignee, assigned.priority, assigned.dueDate], ['Sree Kumar', 'low', '2026-12-01'])
        const cleared = data(await run('update_issue', { issue: id, assignee: 'none', dueDate: 'none', title: 'Login page polish' }, f.context(kumar)))
        assertEquals([cleared.assignee, cleared.dueDate, cleared.title], [null, null, 'Login page polish'])

        assertEquals(code(await run('update_issue', { issue: id, assignee: reddy.id }, f.context(owner))), 'NOT_ALLOWED')
        assertEquals(code(await run('update_issue', { issue: id }, f.context(owner))), 'INVALID_ARGUMENTS')
        assertEquals(code(await run('update_issue', { issue: id, dueDate: 'friday' }, f.context(owner))), 'INVALID_ARGUMENTS')
        assertEquals(code(await run('update_issue', { issue: id, addLabels: ['bug'] }, f.context(owner))), 'NOT_FOUND')
        assertEquals(code(await run('update_issue', { issue: id, sprint: 'current' }, f.context(owner))), 'NOT_FOUND')
        assertEquals(code(await run('update_issue', { issue: id, status: 'done' }, f.context(reddy))), 'NOT_FOUND')

        // The change is logged by the database trigger, as the person who made it.
        const { data: activity } = await f.admin.from('issue_activity').select('kind, actor_id, issue:issues!inner(number, workspace_id)').eq('issue.workspace_id', alpha.id).eq('issue.number', 2).eq('kind', 'title')
        assertEquals(activity?.map((a) => a.actor_id), [kumar.id])
      })

      await t.step('update_issue: labels and sprints by name', async () => {
        const id = `${alpha.key}-2`
        await owner.db.from('issue_labels').insert([{ workspace_id: alpha.id, name: 'Bug', color: 'red' }, { workspace_id: alpha.id, name: 'Design', color: 'blue' }])
        const today = new Date().toISOString().slice(0, 10)
        const later = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
        const { error: cycleError } = await owner.db.from('issue_cycles').insert({ workspace_id: alpha.id, starts_on: today, ends_on: later })
        assert(!cycleError, `sprint fixture: ${cycleError?.message}`)

        data(await run('update_issue', { issue: id, addLabels: ['bug', 'design'], sprint: 'current' }, f.context(kumar)))
        data(await run('update_issue', { issue: id, removeLabels: ['Design'] }, f.context(kumar)))
        const issue = data<{ labels: string[]; sprint: { number: number } | null }>(await run('get_issue', { issue: id }, f.context(owner)))
        assertEquals([issue.labels, issue.sprint?.number], [['Bug'], 1])
        data(await run('update_issue', { issue: id, sprint: 'none' }, f.context(kumar)))
      })

      await t.step('update_issue: In Progress creates the branch only when the project has repos', async () => {
        const id = `${alpha.key}-1`
        f.functionCalls.length = 0
        data(await run('update_issue', { issue: id, status: 'in_progress' }, f.context(kumar)))
        assertEquals(f.functionCalls, [])
        data(await run('update_issue', { issue: id, status: 'todo' }, f.context(kumar)))

        const { data: repo, error } = await owner.db.from('repos').insert({ team_id: f.teamId, owner: 'zz-org', name: 'zz-repo' }).select('id').single()
        assert(repo && !error, `repo fixture: ${error?.message}`)
        const linked = await owner.db.from('workspace_repos').insert({ workspace_id: alpha.id, team_id: f.teamId, repo_id: repo.id })
        assert(!linked.error, `link fixture: ${linked.error?.message}`)

        const moved = data(await run('update_issue', { issue: id, status: 'in_progress' }, f.context(kumar)))
        assertEquals(moved.branch, 'dock/test-branch')
        assertEquals(f.functionCalls.map((c) => [c.name, c.body.action]), [['github', 'create_branch']])
        // Already In Progress: nothing to start.
        data(await run('update_issue', { issue: id, status: 'in_progress', priority: 'urgent' }, f.context(kumar)))
        assertEquals(f.functionCalls.length, 1)
        data(await run('update_issue', { issue: id, repo: 'zz-repo' }, f.context(kumar)))
        assertEquals(data(await run('get_issue', { issue: id }, f.context(kumar))).repository, 'zz-org/zz-repo')
      })

      await t.step('update_issue: GitHub’s status lock still holds for members', async () => {
        const id = `${alpha.key}-1`
        // A connected repo: only the github function can write these columns, so the fixture uses the service role.
        await f.admin.from('github_installations').insert({ installation_id: 987654321, team_id: f.teamId, account_login: 'zz-org', account_type: 'Organization', connected_by: owner.id })
        const connected = await f.admin.from('repos').update({ installation_id: 987654321, github_repo_id: 123456789 }).eq('team_id', f.teamId).eq('name', 'zz-repo').select('id')
        assert(connected.data?.length === 1, `connected repo fixture: ${connected.error?.message}`)
        const locked = await run('update_issue', { issue: id, status: 'done' }, f.context(kumar))
        assertEquals(code(locked), 'STATUS_LOCKED')
        // A manager can override, and anyone can still cancel.
        data(await run('update_issue', { issue: id, status: 'in_review' }, f.context(owner)))
        data(await run('update_issue', { issue: id, status: 'canceled' }, f.context(kumar)))
      })

      // ---------------------------------------------------------- messaging

      await t.step('find_conversation: only conversations the caller can read', async () => {
        const withKumar = data<Conversations>(await run('find_conversation', { withUserId: kumar.id }, f.context(owner)))
        assertEquals(withKumar.conversations.map((c) => [c.id, c.kind, c.title]), [[f.conversations.ownerKumar, 'direct message', 'Sree Kumar']])
        const general = data<Conversations>(await run('find_conversation', { query: '#general' }, f.context(reddy)))
        assertEquals(general.conversations.map((c) => c.id), [f.conversations.general])
        // The owner has no DM with Reddy, and can't see Kumar's.
        const withReddy = data<Conversations>(await run('find_conversation', { withUserId: reddy.id }, f.context(owner)))
        assertEquals(withReddy.conversations, [])
        assert(withReddy.note)
        const all = data<Conversations>(await run('find_conversation', {}, f.context(owner)))
        assert(!all.conversations.some((c) => c.id === f.conversations.kumarReddy))
        assertEquals(data<Conversations>(await run('find_conversation', {}, f.context(outsider))).conversations, [])
      })

      await t.step('send_message: nothing is sent before confirmation, and it is sent once', async () => {
        const store = supabasePendingStore(f.admin)
        const context = f.context(owner)
        const before = await messagesIn(f.conversations.ownerKumar)

        // Called directly, without a confirmation, the tool refuses.
        assertEquals(code(await run('send_message', { recipientUserId: kumar.id, text: 'hi' }, context)), 'NOT_ALLOWED')

        const response = await runAgent({
          provider: scriptedProvider([call('send_message', { recipientUserId: kumar.id, text: 'I’m busy and won’t make the meeting.' })]),
          registry,
          context,
          store,
          system: 'test',
          history: [],
          message: 'tell Sree Kumar I am busy',
        })
        assert(response.type === 'confirmation')
        assertEquals(response.preview.title, 'Send to Sree Kumar')
        assertEquals(await messagesIn(f.conversations.ownerKumar), before)

        // A browser can neither read nor write the pending actions itself.
        const peek = await owner.db.from('ai_pending_actions').select('id')
        assert(peek.error, 'the table must be closed to signed-in users')
        const forged = await owner.db.from('ai_pending_actions').insert({ user_id: owner.id, team_id: f.teamId, tool_name: 'send_message', args: {}, expires_at: new Date(Date.now() + 60_000).toISOString() })
        assert(forged.error, 'a signed-in user must not be able to write a pending action')

        // Someone else can't confirm it.
        const stolen = await confirmPendingAction({ store, registry, context: f.context(kumar), pendingActionId: response.pendingActionId })
        assertEquals(code(stolen.result), 'NOT_FOUND')

        const [first, second] = await Promise.all([
          confirmPendingAction({ store, registry, context, pendingActionId: response.pendingActionId, edits: { text: 'Edited: running late.' } }),
          confirmPendingAction({ store, registry, context, pendingActionId: response.pendingActionId }),
        ])
        assertEquals([code(first.result), code(second.result)].sort(), ['ALREADY_EXECUTED', 'OK'])
        const replay = await confirmPendingAction({ store, registry, context, pendingActionId: response.pendingActionId })
        assertEquals(code(replay.result), 'ALREADY_EXECUTED')
        assertEquals(await messagesIn(f.conversations.ownerKumar), before + 1)

        const { data: sent } = await f.admin.from('messages').select('author_id, content, client_id').eq('conversation_id', f.conversations.ownerKumar).order('created_at', { ascending: false }).limit(1).single()
        assertEquals(sent?.author_id, owner.id)
        assertEquals(sent?.client_id, response.pendingActionId)
        // Kumar was told, as with any message.
        const { count } = await f.admin.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', kumar.id).eq('conversation_id', f.conversations.ownerKumar)
        assert((count ?? 0) >= 1, 'the recipient gets the usual notification')
      })

      await t.step('send_message: a first message to someone starts the direct message; bad targets are refused when preparing', async () => {
        const store = supabasePendingStore(f.admin)
        const context = f.context(owner)
        const prepare = (args: unknown, who = context) => registry.get('send_message')!.executor.prepare!(args, who)

        assertEquals(code(await prepare({ conversationId: f.conversations.kumarReddy, text: 'hi' })), 'NOT_FOUND')
        assertEquals(code(await prepare({ recipientUserId: outsider.id, text: 'hi' })), 'NOT_FOUND')
        assertEquals(code(await prepare({ recipientUserId: owner.id, text: 'hi' })), 'NOT_ALLOWED')
        assertEquals(code(await prepare({ text: 'hi' })), 'INVALID_ARGUMENTS')
        assertEquals(code(await prepare({ recipientUserId: kumar.id, text: 'hi' }, f.context(outsider))), 'NOT_FOUND')

        const response = await runAgent({
          provider: scriptedProvider([call('send_message', { recipientUserId: reddy.id, text: 'Hello Reddy' })]),
          registry,
          context,
          store,
          system: 'test',
          history: [],
          message: 'say hello to Sree Reddy',
        })
        assert(response.type === 'confirmation')
        // Preparing started no conversation.
        assertEquals(data<Conversations>(await run('find_conversation', { withUserId: reddy.id }, context)).conversations.length, 0)
        const done = await confirmPendingAction({ store, registry, context, pendingActionId: response.pendingActionId })
        assertEquals(code(done.result), 'OK')
        assertEquals(data<Conversations>(await run('find_conversation', { withUserId: reddy.id }, context)).conversations.length, 1)

        const channel = await runAgent({
          provider: scriptedProvider([call('send_message', { conversationId: f.conversations.general, text: 'Hello all' })]),
          registry,
          context: f.context(reddy),
          store,
          system: 'test',
          history: [],
          message: 'post hello in general',
        })
        assert(channel.type === 'confirmation')
        assertEquals(channel.preview.title, 'Send to #general')
        const posted = await confirmPendingAction({ store, registry, context: f.context(reddy), pendingActionId: channel.pendingActionId })
        assertEquals(code(posted.result), 'OK')
        assertEquals(await messagesIn(f.conversations.general), 1)

        // Preparing again cleans up this person's finished actions.
        const { count } = await f.admin.from('ai_pending_actions').select('id', { count: 'exact', head: true }).eq('user_id', owner.id)
        assertEquals(count, 1)
      })

      // ----------------------------------------------------------- meetings

      await t.step('get_upcoming_meetings: the caller’s own meetings', async () => {
        const titles = async (args: unknown, context: AiExecutionContext) => data<Meetings>(await run('get_upcoming_meetings', args, context)).meetings.map((m) => m.title)
        assertEquals(await titles({}, f.context(owner)), ['Group sync', 'Alpha review', 'Beta planning'])
        assertEquals(await titles({}, f.context(kumar)), ['Group sync', 'Alpha review'])
        assertEquals(await titles({}, f.context(reddy)), ['Group sync'])
        assertEquals(await titles({}, f.context(outsider)), [])
        // "With Sree Kumar": the meetings he is part of.
        assertEquals(await titles({ withUserId: kumar.id }, f.context(owner)), ['Group sync', 'Alpha review'])
        assertEquals(await titles({ withUserId: reddy.id }, f.context(owner)), ['Group sync'])
        assertEquals(await titles({ query: 'review' }, f.context(owner)), ['Alpha review'])
        assertEquals(await titles({ limit: 1 }, f.context(owner)), ['Group sync'])
        // A window that ended before they start.
        assertEquals(await titles({ from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z' }, f.context(owner)), [])
        // "Today" is the person's day: far enough east it is already tomorrow.
        const eastern = f.context(owner, { timeZone: 'Pacific/Kiritimati', currentTime: new Date(Date.now() - 20 * 3_600_000).toISOString() })
        const today = await titles({ range: 'today' }, eastern)
        const week = await titles({ range: 'this_week' }, f.context(owner))
        assert(today.length <= 3 && week.length <= 3)
      })

      await t.step('get_meeting: details for its audience, never the room', async () => {
        const meeting = data(await run('get_meeting', { meetingId: f.meetings.alpha }, f.context(kumar)))
        assertEquals([meeting.title, meeting.for, meeting.organizer, meeting.description, meeting.status], ['Alpha review', 'Alpha Rocket', 'Zed Owner', 'Agenda: plans.', 'upcoming'])
        // The project's people, as the app lists them: a group owner who wasn't added to it isn't one of them.
        assertEquals(meeting.people, ['Sree Kumar'])
        assert(!/room/i.test(JSON.stringify(meeting)), 'the room name must never be returned')
        const group = data(await run('get_meeting', { meetingId: f.meetings.group }, f.context(reddy)))
        assertEquals(group.peopleCount, 3)
        assertEquals(code(await run('get_meeting', { meetingId: f.meetings.alpha }, f.context(reddy))), 'NOT_FOUND')
        assertEquals(code(await run('get_meeting', { meetingId: f.meetings.group }, f.context(outsider))), 'NOT_FOUND')
      })

      // --------------------------------------------------------- agent loop

      await t.step('agent loop: several real tools in one request', async () => {
        const provider = scriptedProvider([
          call('find_user', { name: 'Sree Kumar' }),
          (input) => {
            const last = input.messages.at(-1)
            const people = last?.role === 'tool' && last.results[0].result.success ? (last.results[0].result.data as { people: { id: string }[] }).people : []
            return call('update_issue', { issue: `${beta.key}-1`, assignee: people[0]?.id })
          },
          { text: 'I couldn’t assign it: Sree Kumar isn’t in that project.', toolCalls: [] },
        ])
        const response = await runAgent({ provider, registry, context: f.context(owner), store: supabasePendingStore(f.admin), system: 'test', history: [], message: 'assign the plants issue to Sree Kumar' })
        assert(response.type === 'message')
        const last = provider.inputs[2].messages.at(-1)
        assert(last?.role === 'tool')
        // Kumar isn't in Beta: the database refused, and the model was told so.
        assertEquals(code(last.results[0].result), 'NOT_ALLOWED')
      })
    } finally {
      await f.cleanup()
    }
  },
})
