// The tools against a real database: the local Supabase stack, real RLS,
// real triggers and RPCs, one signed-in client per test person. Skipped unless
// tests/run-local.sh supplied the local stack. No model is involved: where the
// agent loop is exercised, the provider is scripted.

import { buildContext } from '../agent/context.ts'
import { localDate, zonedInstant } from '../agent/time.ts'
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
type Reminder = { id: string; title: string; when: string; remindAt: string; status: string; issue: string | null; project: string | null; notes?: string }
type Reminders = { reminders: Reminder[]; total: number; note?: string }
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

      // ---------------------------------------------------------- reminders

      await t.step('create_reminder: the time is worked out on the server, and an issue brings its project', async () => {
        const before = Date.now()
        const soon = data<{ created: Reminder }>(await run('create_reminder', { title: 'Review the redirect fix', inMinutes: 45, issue: `${alpha.key}-1` }, f.context(kumar))).created
        assertEquals([soon.issue, soon.project, soon.status], [`${alpha.key}-1`, 'Alpha Rocket', 'upcoming'])
        const minutes = (Date.parse(soon.remindAt) - before) / 60_000
        assert(minutes > 44 && minutes < 46, `45 minutes from now, got ${minutes}`)
        // The owner is the caller, whatever else is sent.
        const { data: row } = await f.admin.from('reminders').select('user_id, team_id, workspace_id').eq('id', soon.id).single()
        assertEquals(row, { user_id: kumar.id, team_id: f.teamId, workspace_id: alpha.id })
        assert(!JSON.stringify(soon).includes(kumar.id), 'no user ids in the result')

        // A local date and time, in the person's zone.
        const zone = 'Asia/Kolkata'
        const tomorrow = localDate(new Date(Date.now() + 86_400_000), zone)
        const nine = data<{ created: Reminder }>(await run('create_reminder', { title: 'Deploy staging', date: tomorrow, time: '09:00', notes: 'Check the migrations first' }, f.context(kumar, { timeZone: zone }))).created
        assertEquals(nine.remindAt, zonedInstant(tomorrow, '09:00', zone).toISOString())
        assertEquals([nine.issue, nine.project, nine.notes], [null, null, 'Check the migrations first'])
        // A time alone is the next time it comes round.
        const later = data<{ created: Reminder }>(await run('create_reminder', { title: 'Stand-up notes', time: '23:59' }, f.context(kumar))).created
        assert(Date.parse(later.remindAt) > Date.now() && Date.parse(later.remindAt) - Date.now() <= 86_400_000)
        // A project without an issue.
        const garden = data<{ created: Reminder }>(await run('create_reminder', { title: 'Plan the garden', inMinutes: 90, project: 'beta' }, f.context(owner))).created
        assertEquals([garden.project, garden.issue], ['Beta Garden', null])
      })

      await t.step('create_reminder: before a meeting is counted from its start on the server', async () => {
        const { data: start } = await f.admin.from('live_sessions').select('starts_at').eq('id', f.meetings.group).single()
        const made = data<{ created: Reminder; forMeeting: { title: string } }>(
          await run('create_reminder', { title: 'Group sync', meetingId: f.meetings.group, minutesBefore: 15 }, f.context(kumar)),
        )
        assertEquals(Date.parse(made.created.remindAt), Date.parse((start as { starts_at: string }).starts_at) - 15 * 60_000)
        assertEquals(made.forMeeting.title, 'Group sync')
        // How long before is asked, not guessed; zero means "when it starts".
        assertEquals(code(await run('create_reminder', { title: 'x', meetingId: f.meetings.group }, f.context(kumar))), 'NEEDS_CLARIFICATION')
        assertEquals(code(await run('create_reminder', { title: 'x', minutesBefore: 10 }, f.context(kumar))), 'INVALID_ARGUMENTS')
        // Only a meeting the person can open.
        assertEquals(code(await run('create_reminder', { title: 'x', meetingId: f.meetings.alpha, minutesBefore: 10 }, f.context(reddy))), 'NOT_FOUND')
        // One way to give the time.
        assertEquals(code(await run('create_reminder', { title: 'x', meetingId: f.meetings.group, minutesBefore: 10, inMinutes: 5 }, f.context(kumar))), 'INVALID_ARGUMENTS')
      })

      await t.step('notes: a note without a time is only saved when the person said so', async () => {
        const kumarCtx = f.context(kumar)
        // Neither a time nor "just a note" is asked about, not assumed.
        assertEquals(code(await run('create_reminder', { title: 'Buy milk' }, kumarCtx)), 'NEEDS_CLARIFICATION')
        const note = data<{ created: Pick<Reminder, 'id' | 'status'> & { when: string | null; remindAt: string | null } }>(await run('create_reminder', { title: 'Buy milk', withoutTime: true }, kumarCtx)).created
        assertEquals([note.when, note.remindAt, note.status], [null, null, 'note'])
        assertEquals(code(await run('create_reminder', { title: 'x', withoutTime: true, inMinutes: 5 }, kumarCtx)), 'INVALID_ARGUMENTS')
        // Giving it a time later, then taking it away again.
        const timed = data<{ updated: Reminder }>(await run('update_reminder', { reminderId: note.id, inMinutes: 30 }, kumarCtx)).updated
        assertEquals(timed.status, 'upcoming')
        const plain = data<{ updated: { when: string | null; status: string } }>(await run('update_reminder', { reminderId: note.id, removeTime: true }, kumarCtx)).updated
        assertEquals([plain.when, plain.status], [null, 'note'])
        assertEquals(code(await run('update_reminder', { reminderId: note.id, removeTime: true, inMinutes: 5 }, kumarCtx)), 'INVALID_ARGUMENTS')
        // A day alone cannot time a note that had no time.
        assertEquals(code(await run('update_reminder', { reminderId: note.id, date: localDate(new Date(Date.now() + 86_400_000), 'UTC') }, kumarCtx)), 'NEEDS_CLARIFICATION')
        await f.admin.from('reminders').delete().eq('id', note.id)
      })

      await t.step('create_reminder: unclear or impossible times are asked about, never guessed', async () => {
        const ctx = f.context(kumar)
        assertEquals(code(await run('create_reminder', { title: 'x' }, ctx)), 'NEEDS_CLARIFICATION')
        assertEquals(code(await run('create_reminder', { title: 'x', date: localDate(new Date(Date.now() + 86_400_000), 'UTC') }, ctx)), 'NEEDS_CLARIFICATION')
        assertEquals(code(await run('create_reminder', { title: 'x', inMinutes: 5, time: '10:00' }, ctx)), 'INVALID_ARGUMENTS')
        assertEquals(code(await run('create_reminder', { title: 'x', time: '9am' }, ctx)), 'INVALID_ARGUMENTS')
        // Two hours before a meeting that starts in one is already past.
        assertEquals(code(await run('create_reminder', { title: 'x', meetingId: f.meetings.group, minutesBefore: 120 }, ctx)), 'INVALID_ARGUMENTS')
        // A raw timestamp is not a way to give the time (a UTC start time once came back with a local offset on it): it is ignored, so the time is still asked.
        assertEquals(code(await run('create_reminder', { title: 'x', remindAt: new Date(Date.now() + 3_600_000).toISOString() }, ctx)), 'NEEDS_CLARIFICATION')
        assertEquals(code(await run('create_reminder', { title: 'x', inMinutes: 5, issue: 'the login one' }, ctx)), 'INVALID_ARGUMENTS')
      })

      await t.step('create_reminder: only issues and projects the person can open', async () => {
        // Reddy is in the group but in no project.
        assertEquals(code(await run('create_reminder', { title: 'Peek', inMinutes: 5, issue: `${alpha.key}-1` }, f.context(reddy))), 'NOT_FOUND')
        assertEquals(code(await run('create_reminder', { title: 'Peek', inMinutes: 5, project: 'Alpha Rocket' }, f.context(reddy))), 'NOT_FOUND')
        assertEquals(code(await run('create_reminder', { title: 'Elsewhere', inMinutes: 5 }, f.context(outsider))), 'PERMISSION_DENIED')
        const { count } = await f.admin.from('reminders').select('id', { count: 'exact', head: true }).eq('title', 'Peek')
        assertEquals(count, 0)
      })

      await t.step('list_reminders: your own, by status and day', async () => {
        // One whose time has passed (written as the table owner; the tools refuse past times).
        await f.admin.from('reminders').insert({ user_id: kumar.id, team_id: f.teamId, title: 'Send the invoice', remind_at: new Date(Date.now() - 600_000).toISOString() })
        const open = data<Reminders>(await run('list_reminders', {}, f.context(kumar)))
        assertEquals(open.reminders[0].title, 'Send the invoice')
        assertEquals(open.reminders[0].status, 'overdue')
        assertEquals(open.total, 5)
        assertEquals(data<Reminders>(await run('list_reminders', { status: 'overdue' }, f.context(kumar))).reminders.map((r) => r.title), ['Send the invoice'])
        assertEquals(data<Reminders>(await run('list_reminders', { query: 'staging' }, f.context(kumar))).reminders.map((r) => r.title), ['Deploy staging'])
        const tomorrow = data<Reminders>(await run('list_reminders', { range: 'tomorrow' }, f.context(kumar, { timeZone: 'Asia/Kolkata' })))
        assert(tomorrow.reminders.some((r) => r.title === 'Deploy staging'))
        // Nobody else sees them, not even the group's owner.
        assertEquals(data<Reminders>(await run('list_reminders', {}, f.context(owner))).reminders.map((r) => r.title), ['Plan the garden'])
        assertEquals(data<Reminders>(await run('list_reminders', {}, f.context(reddy))).total, 0)
      })

      await t.step('update_reminder: by words, snooze, keep the time of day, and drop the issue', async () => {
        const snoozed = data<{ updated: Reminder }>(await run('update_reminder', { reminder: 'invoice', inMinutes: 60 }, f.context(kumar))).updated
        assertEquals(snoozed.status, 'upcoming')
        const { data: row } = await f.admin.from('reminders').select('notified_at').eq('id', snoozed.id).single()
        assertEquals(row, { notified_at: null })

        // A date alone keeps 09:00 in the person's zone.
        const zone = 'Asia/Kolkata'
        const inThreeDays = localDate(new Date(Date.now() + 3 * 86_400_000), zone)
        const moved = data<{ updated: Reminder }>(await run('update_reminder', { reminder: 'staging', date: inThreeDays }, f.context(kumar, { timeZone: zone }))).updated
        assertEquals(moved.remindAt, zonedInstant(inThreeDays, '09:00', zone).toISOString())

        const unlinked = data<{ updated: Reminder }>(await run('update_reminder', { reminder: 'redirect', issue: 'none', title: 'Review the redirect' }, f.context(kumar))).updated
        assertEquals([unlinked.title, unlinked.issue, unlinked.project], ['Review the redirect', null, 'Alpha Rocket'])

        assertEquals(code(await run('update_reminder', { reminder: 'invoice' }, f.context(kumar))), 'INVALID_ARGUMENTS')
        assertEquals(code(await run('update_reminder', { reminder: 'nothing like this', inMinutes: 5 }, f.context(kumar))), 'NOT_FOUND')
      })

      await t.step('reminders: several matches are listed, never picked', async () => {
        await run('create_reminder', { title: 'Review the slides', inMinutes: 30 }, f.context(kumar))
        const both = await run('complete_reminder', { reminder: 'review' }, f.context(kumar))
        assertEquals(code(both), 'AMBIGUOUS')
        const candidates = (both as { details?: { reminders: Reminder[] } }).details?.reminders ?? []
        assertEquals(candidates.map((r) => r.title).sort(), ['Review the redirect', 'Review the slides'])
      })

      await t.step('complete, cancel and reopen: as the page does, and only your own', async () => {
        const done = data<{ completed: Reminder }>(await run('complete_reminder', { reminder: 'slides' }, f.context(kumar))).completed
        assertEquals(done.status, 'completed')
        const { data: row } = await f.admin.from('reminders').select('status, completed_at').eq('id', done.id).single()
        assert(row?.status === 'completed' && row.completed_at !== null)
        assertEquals(data<{ note?: string }>(await run('complete_reminder', { reminderId: done.id }, f.context(kumar))).note, 'It was already completed.')

        const cancelled = data<{ cancelled: Reminder }>(await run('cancel_reminder', { reminder: 'staging' }, f.context(kumar))).cancelled
        assertEquals(cancelled.status, 'cancelled')
        assertEquals(data<Reminders>(await run('list_reminders', { status: 'cancelled' }, f.context(kumar))).reminders.map((r) => r.title), ['Deploy staging'])
        const reopened = data<{ updated: Reminder }>(await run('update_reminder', { reminder: 'staging', reopen: true }, f.context(kumar))).updated
        assertEquals(reopened.status, 'upcoming')

        // Someone else can't touch it, even with its id.
        assertEquals(code(await run('cancel_reminder', { reminderId: done.id }, f.context(owner))), 'NOT_FOUND')
        assertEquals(code(await run('update_reminder', { reminderId: reopened.id, title: 'Mine now' }, f.context(reddy))), 'NOT_FOUND')
        const { data: still } = await f.admin.from('reminders').select('title, user_id').eq('id', reopened.id).single()
        assertEquals(still, { title: 'Deploy staging', user_id: kumar.id })
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

      await t.step('agent loop: "remind me" runs at once, with no confirmation card', async () => {
        const provider = scriptedProvider([
          call('create_reminder', { title: 'Check the deploy', inMinutes: 30, issue: `${alpha.key}-2` }),
          { text: 'Done: I’ll remind you in 30 minutes.', toolCalls: [] },
        ])
        const response = await runAgent({ provider, registry, context: f.context(kumar), store: supabasePendingStore(f.admin), system: 'test', history: [], message: 'remind me in 30 minutes to check the deploy for the styling issue' })
        assertEquals(response.type, 'message')
        const { data: rows } = await f.admin.from('reminders').select('title, user_id, status').eq('title', 'Check the deploy')
        assertEquals(rows, [{ title: 'Check the deploy', user_id: kumar.id, status: 'pending' }])
        const { count } = await f.admin.from('ai_pending_actions').select('id', { count: 'exact', head: true }).eq('user_id', kumar.id)
        assertEquals(count, 0)
      })
    } finally {
      await f.cleanup()
    }
  },
})
