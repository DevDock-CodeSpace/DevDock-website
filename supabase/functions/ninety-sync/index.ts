// ninety-sync: DevDock → Ninety (EOS). Design: docs/NINETY.md.
//   Phase 1: sprint issues as Ninety To-Dos.
//   Phase 2: plans as Rocks, their issues with a due date as Milestones, To-Dos linked to their plan's Rock.
//   Phase 3: issues labelled IDS as Ninety Issues (the weekly meeting's list to Identify, Discuss, Solve).
//
// POST { action, … }
//   With the person's Supabase token (group owners/admins of a group with the ninety_sync flag):
//     connect { teamId, token, appUrl } → { teams, owner }
//       Checks the Ninety token with Ninety, keeps it in Vault (never returned), and records this
//       function's URL for the cron call.
//     teams   { teamId } → { teams }         Ninety teams, for linking projects.
//     sync    { teamId } → { sent, failed }  Queues every linked issue and sends it now.
//   With the person's token, anyone in a group with the flag:
//     overview { teamId } → what is in Ninety now (overview.ts), or { connected: false }.
//     send     { teamId } → { sent, failed }  Sends what is waiting now (the page's Sync now).
//   pg_cron runs drain twice a day (00:00 and 12:00 UTC).
//   From pg_cron (private.ninety_kick), header x-ninety-cron = the Vault secret:
//     drain → { teams, sent, failed }        Sends what the outbox holds.
//
// Errors: 400 bad_request · 401 unauthorized · 403 forbidden / not_enabled · 409 not_connected ·
// 422 token_rejected · 502 ninety_error
//
// No secrets of its own: it uses SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY, which
// every Supabase function has. The service role is used only after the caller's checks, or for cron.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { ninetyClient, NinetyError, userName, type NinetyClient } from './ninety.ts'
import { buildOverview } from './overview.ts'
import { idsPlan, milestonePlan, plan, rockPlan, type IdsLink, type IssueRow, type Link, type MilestoneLink, type PlanRow, type RockLink } from './plan.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const FLAG = 'ninety_sync'
const BATCH = 200
// Stop starting new work after this long, so a run ends inside the cron call's timeout.
const RUN_BUDGET_MS = 40_000
const MAX_ATTEMPTS = 5

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const today = () => new Date().toISOString().slice(0, 10)

function service(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** The caller, who must be in a group that has the flag (an owner/admin unless `anyone`). Checked under their own RLS. */
async function requireGroupAdmin(req: Request, teamId: unknown, anyone = false) {
  if (!isUuid(teamId)) throw new HttpError(400, 'bad_request')
  const accessToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!accessToken) throw new HttpError(401, 'unauthorized')
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error } = await db.auth.getUser(accessToken)
  if (error || !userData.user) throw new HttpError(401, 'unauthorized')
  const { data: row } = await db
    .from('team_members')
    .select('role, team:teams(enabled_features)')
    .eq('team_id', teamId)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  const member = row as unknown as { role: string; team: { enabled_features: string[] | null } | null } | null
  if (!member || (!anyone && member.role !== 'owner' && member.role !== 'admin')) throw new HttpError(403, 'forbidden')
  if (!member.team?.enabled_features?.includes(FLAG)) throw new HttpError(403, 'not_enabled')
  return { user: userData.user, teamId, db }
}

async function tokenOf(admin: SupabaseClient, teamId: string): Promise<string> {
  const { data } = await admin.rpc('ninety_token', { p_team: teamId })
  if (typeof data !== 'string' || !data) throw new HttpError(409, 'not_connected')
  return data
}

function ninetyFailure(e: unknown): never {
  if (e instanceof NinetyError && (e.status === 401 || e.status === 403)) throw new HttpError(422, 'token_rejected')
  throw new HttpError(502, 'ninety_error')
}

// ------------------------------------------------------------------------------------------------ connect

async function connect(req: Request, body: Record<string, unknown>) {
  const { user, teamId } = await requireGroupAdmin(req, body.teamId)
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const appUrl = typeof body.appUrl === 'string' ? body.appUrl.trim().replace(/\/+$/, '') : ''
  if (!/^[A-Za-z0-9_\-.]{20,300}$/.test(token) || !/^https?:\/\/[^/]+$/.test(appUrl)) throw new HttpError(400, 'bad_request')

  const ninety = ninetyClient(token)
  let teams, users
  try {
    ;[teams, users] = await Promise.all([ninety.teams(), ninety.users()])
  } catch (e) {
    ninetyFailure(e)
  }
  // Who owns To-Dos for people who aren't in Ninety: the person connecting, else the company owner.
  const email = user.email?.toLowerCase()
  const owner = users.find((u) => u.primaryEmail?.toLowerCase() === email) ?? users.find((u) => u.role === 'owner') ?? users[0]
  if (!owner) throw new HttpError(422, 'token_rejected')

  const admin = service()
  const { error } = await admin.rpc('ninety_save_connection', {
    p_team: teamId,
    p_token: token,
    p_company_id: teams[0]?.companyId ?? null,
    p_owner_id: owner.id,
    p_owner_name: userName(owner),
    p_app_url: appUrl,
    p_connected_by: user.id,
    p_function_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/ninety-sync`,
  } as never)
  if (error) {
    console.error('[ninety] save connection', error)
    throw new HttpError(500, 'internal')
  }
  return { teams: teams.map((t) => ({ id: t._id, name: t.name })), owner: userName(owner) }
}

async function listTeams(req: Request, body: Record<string, unknown>) {
  const { teamId } = await requireGroupAdmin(req, body.teamId)
  const ninety = ninetyClient(await tokenOf(service(), teamId))
  try {
    return { teams: (await ninety.teams()).map((t) => ({ id: t._id, name: t.name })) }
  } catch (e) {
    ninetyFailure(e)
  }
}

// ------------------------------------------------------------------------------------------------ sending

type Outcome = { sent: number; failed: number; stopped?: string }

/** Sends one group's queue: plans first (Rocks), then issues (To-Dos, their Rock link, Milestones). */
async function drainTeam(admin: SupabaseClient, teamId: string, deadline: number, manual: boolean): Promise<Outcome> {
  const outcome: Outcome = { sent: 0, failed: 0 }
  const { data: active } = await admin.rpc('ninety_team_active', { p_team: teamId })
  if (active !== true) {
    // Flag switched off or disconnected: nothing goes out, and the queues are dropped.
    await admin.from('ninety_outbox').delete().eq('team_id', teamId)
    await admin.from('ninety_plan_outbox').delete().eq('team_id', teamId)
    return outcome
  }

  // Nothing waiting: no Ninety call at all.
  const [{ count: issuesWaiting }, { count: plansWaiting }] = await Promise.all([
    admin.from('ninety_outbox').select('issue_id', { count: 'exact', head: true }).eq('team_id', teamId),
    admin.from('ninety_plan_outbox').select('plan_id', { count: 'exact', head: true }).eq('team_id', teamId),
  ])
  if (!issuesWaiting && !plansWaiting) return outcome

  const [conn, team, people] = await Promise.all([
    admin.from('ninety_connections').select('ninety_owner_id, app_url, rocks_ninety_team_id').eq('team_id', teamId).single(),
    admin.from('teams').select('slug').eq('id', teamId).single(),
    admin.rpc('ninety_member_emails', { p_team: teamId }),
  ])
  if (conn.error || team.error || people.error) {
    console.error('[ninety] load', conn.error ?? team.error ?? people.error)
    throw new Error('load failed')
  }
  const { ninety_owner_id: owner, app_url: appUrl, rocks_ninety_team_id: rocksTeamId } = conn.data as {
    ninety_owner_id: string
    app_url: string
    rocks_ninety_team_id: string | null
  }
  const slug = (team.data as { slug: string }).slug
  const day = today()

  const ninety: NinetyClient = ninetyClient(await tokenOf(admin, teamId))
  let ninetyUsers
  try {
    ninetyUsers = await ninety.users()
  } catch (e) {
    await recordConnectionError(admin, teamId, e)
    outcome.stopped = 'users'
    return outcome
  }
  const ninetyByEmail = new Map(ninetyUsers.filter((u) => u.active !== false && u.primaryEmail).map((u) => [u.primaryEmail!.toLowerCase(), u.id]))
  const members = new Map((people.data as { user_id: string; email: string | null; display_name: string | null }[]).map((p) => [p.user_id, p]))
  const ninetyUserOf = (userId: string) => {
    const email = members.get(userId)?.email
    return (email && ninetyByEmail.get(email)) || null
  }
  const nameOf = (userId: string) => members.get(userId)?.display_name?.trim() || members.get(userId)?.email || 'someone'

  /** Runs one queued item; a refused token or the rate limit stops the group, anything else is retried later. */
  async function attempt(table: 'ninety_outbox' | 'ninety_plan_outbox', key: 'issue_id' | 'plan_id', id: string, attempts: number, work: () => Promise<boolean>) {
    try {
      const sent = await work()
      await admin.from(table).delete().eq(key, id)
      if (sent) outcome.sent++
      return true
    } catch (e) {
      if (e instanceof NinetyError && (e.status === 401 || e.status === 403 || e.status === 429)) {
        if (e.status !== 429) await recordConnectionError(admin, teamId, e)
        outcome.stopped = String(e.status)
        return false
      }
      outcome.failed++
      console.error('[ninety]', key, id, e)
      await admin.from(table).update({ attempts: attempts + 1, last_error: e instanceof NinetyError ? `Ninety ${e.status}` : 'DevDock error' }).eq(key, id)
      return true
    }
  }
  const must = <T>(result: { data: T; error: unknown }) => {
    if (result.error) throw result.error
    return result.data
  }

  // ---------------------------------------------------------------- plans → Rocks
  let planQuery = admin.from('ninety_plan_outbox').select('plan_id, attempts').eq('team_id', teamId).order('queued_at').limit(BATCH)
  if (!manual) planQuery = planQuery.lt('attempts', MAX_ATTEMPTS)
  const queuedPlans = must(await planQuery) as { plan_id: string; attempts: number }[]
  if (queuedPlans.length) {
    const planIds = queuedPlans.map((q) => q.plan_id)
    const [plans, rockLinks] = await Promise.all([
      admin.from('plans').select('id, name, status, lead_id, target_on').in('id', planIds),
      admin.from('ninety_rock_links').select('plan_id, ninety_rock_id, sent_hash').in('plan_id', planIds),
    ])
    const planById = new Map((must(plans) as PlanRow[]).map((p) => [p.id, p]))
    const rockLinkOf = new Map((must(rockLinks) as (RockLink & { plan_id: string })[]).map((l) => [l.plan_id, l]))
    for (const { plan_id: planId, attempts } of queuedPlans) {
      if (Date.now() > deadline || outcome.stopped) break
      const step = rockPlan({
        plan: planById.get(planId) ?? null,
        link: rockLinkOf.get(planId) ?? null,
        rocksTeamId,
        ninetyUserOf,
        fallbackOwner: owner,
        today: day,
        planUrl: (p) => `${appUrl}/t/${slug}/issues/plans/${p.id}`,
      })
      const goOn = await attempt('ninety_plan_outbox', 'plan_id', planId, attempts, async () => {
        if (step.kind === 'create') {
          const rock = await ninety.createRock(step.body)
          must(await admin.from('ninety_rock_links').insert({ plan_id: planId, team_id: teamId, ninety_rock_id: rock._id, sent_hash: step.hash }))
          // Its issues now have a Rock for their Milestones and To-Do links.
          must(await admin.rpc('ninety_queue_plan_issues', { p_team: teamId, p_plan: planId }))
        } else if (step.kind === 'update') {
          await ninety.updateRock(step.rockId, step.body)
          must(await admin.from('ninety_rock_links').update({ sent_hash: step.hash, synced_at: new Date().toISOString() }).eq('plan_id', planId))
        } else if (step.kind === 'delete') {
          await ninety.deleteRock(step.rockId)
          must(await admin.from('ninety_rock_links').delete().eq('plan_id', planId))
        }
        return step.kind !== 'none'
      })
      if (!goOn) return finish()
    }
  }

  // ---------------------------------------------------------------- issues → To-Dos, Rock links, Milestones
  let issueQuery = admin.from('ninety_outbox').select('issue_id, attempts').eq('team_id', teamId).order('queued_at').limit(BATCH)
  if (!manual) issueQuery = issueQuery.lt('attempts', MAX_ATTEMPTS)
  const queued = must(await issueQuery) as { issue_id: string; attempts: number }[]
  if (queued.length) {
    const ids = queued.map((q) => q.issue_id)
    const [issues, links, milestoneLinks, maps, rocks, idsLinks, labelled] = await Promise.all([
      admin
        .from('issues')
        .select('id, number, title, status, assignee_id, due_date, workspace_id, plan_id, workspace:workspaces(issue_key), cycle:issue_cycles(starts_on, ends_on)')
        .in('id', ids),
      admin.from('ninety_links').select('issue_id, ninety_todo_id, sent_hash, completed, linked_rock_id').in('issue_id', ids),
      admin.from('ninety_milestone_links').select('issue_id, ninety_milestone_id, ninety_rock_id, sent_hash, removed').in('issue_id', ids),
      admin.from('ninety_workspace_teams').select('workspace_id, ninety_team_id').eq('team_id', teamId),
      admin.from('ninety_rock_links').select('plan_id, ninety_rock_id').eq('team_id', teamId),
      admin.from('ninety_issue_links').select('issue_id, ninety_issue_id, sent_hash, completed').in('issue_id', ids),
      admin.rpc('ninety_ids_issues', { p_issues: ids }),
    ])
    type Row = IssueRow & { plan_id: string | null }
    const issueById = new Map(
      (must(issues) as unknown as (Omit<Row, 'issue_key'> & { workspace: { issue_key: string } | null })[]).map((i) => [
        i.id,
        { ...i, issue_key: i.workspace?.issue_key ?? 'ISSUE' } as Row,
      ]),
    )
    const linkById = new Map((must(links) as (Link & { issue_id: string; linked_rock_id: string | null })[]).map((l) => [l.issue_id, l]))
    const msLinkById = new Map((must(milestoneLinks) as (MilestoneLink & { issue_id: string })[]).map((l) => [l.issue_id, l]))
    const teamOf = new Map((must(maps) as { workspace_id: string; ninety_team_id: string }[]).map((m) => [m.workspace_id, m.ninety_team_id]))
    const idsLinkById = new Map((must(idsLinks) as (IdsLink & { issue_id: string })[]).map((l) => [l.issue_id, l]))
    const isLabelled = new Set(must(labelled) as string[])
    const rockOfPlan = new Map((must(rocks) as { plan_id: string; ninety_rock_id: string }[]).map((r) => [r.plan_id, r.ninety_rock_id]))

    for (const { issue_id: issueId, attempts } of queued) {
      if (Date.now() > deadline || outcome.stopped) break
      const issue = issueById.get(issueId) ?? null
      const link = linkById.get(issueId) ?? null
      const goOn = await attempt('ninety_outbox', 'issue_id', issueId, attempts, async () => {
        let sent = false

        // The To-Do.
        const step = plan({
          issue,
          link,
          ninetyTeamId: issue ? (teamOf.get(issue.workspace_id) ?? null) : null,
          ninetyUserOf,
          nameOf,
          fallbackOwner: owner,
          today: day,
          issueUrl: (i) => `${appUrl}/t/${slug}/w/${i.workspace_id}/issues/${i.number}`,
        })
        let todoId: string | null = link?.ninety_todo_id ?? null
        let linkedRock: string | null = link?.linked_rock_id ?? null
        if (step.kind === 'create') {
          todoId = (await ninety.createTodo(step.body))._id
          linkedRock = null
          must(await admin.from('ninety_links').insert({ issue_id: issueId, team_id: teamId, ninety_todo_id: todoId, sent_hash: step.hash, completed: false }))
          sent = true
        } else if (step.kind === 'update') {
          await ninety.updateTodo(step.todoId, step.body)
          must(await admin.from('ninety_links').update({ sent_hash: step.hash, completed: step.completed, synced_at: new Date().toISOString() }).eq('issue_id', issueId))
          sent = true
        } else if (step.kind === 'delete') {
          await ninety.deleteTodo(step.todoId)
          must(await admin.from('ninety_links').delete().eq('issue_id', issueId))
          todoId = null
          sent = true
        }

        // The To-Do's link to its plan's Rock (only while the group sends Rocks: unsetting the Rocks team
        // leaves what is in Ninety as it is).
        if (todoId && rocksTeamId) {
          const wantRock = (issue?.plan_id && rockOfPlan.get(issue.plan_id)) || null
          if (wantRock !== linkedRock) {
            if (linkedRock) await ninety.unlinkTodoFromRock(todoId, linkedRock)
            if (wantRock) await ninety.linkTodoToRock(todoId, wantRock)
            must(await admin.from('ninety_links').update({ linked_rock_id: wantRock }).eq('issue_id', issueId))
            sent = true
          }
        }

        // The Milestone (same: only while the group sends Rocks).
        for (const ms of !rocksTeamId ? [] : milestonePlan({
          issue,
          link: msLinkById.get(issueId) ?? null,
          rockOf: (planId) => rockOfPlan.get(planId) ?? null,
          ninetyUserOf,
          fallbackOwner: owner,
        })) {
          if (ms.kind === 'create') {
            const created = await ninety.createMilestone({ rockId: ms.rockId, teamId: rocksTeamId!, title: ms.body.title, dueDate: ms.body.dueDate })
            // Owner and state aren't taken on create: set them straight after.
            await ninety.updateMilestone(created._id, { ownedByUserId: ms.body.ownedByUserId, isDone: ms.body.isDone })
            must(
              await admin.from('ninety_milestone_links').upsert({
                issue_id: issueId,
                team_id: teamId,
                ninety_milestone_id: created._id,
                ninety_rock_id: ms.rockId,
                sent_hash: ms.hash,
                removed: false,
                synced_at: new Date().toISOString(),
              }),
            )
          } else if (ms.kind === 'update') {
            await ninety.updateMilestone(ms.milestoneId, ms.body)
            must(await admin.from('ninety_milestone_links').update({ sent_hash: ms.hash, synced_at: new Date().toISOString() }).eq('issue_id', issueId))
          } else {
            await ninety.updateMilestone(ms.milestoneId, ms.body)
            must(await admin.from('ninety_milestone_links').update({ removed: true, synced_at: new Date().toISOString() }).eq('issue_id', issueId))
          }
          sent = true
        }

        // The Ninety Issue (IDS label).
        const discuss = idsPlan({
          issue,
          link: idsLinkById.get(issueId) ?? null,
          labelled: isLabelled.has(issueId),
          ninetyTeamId: issue ? (teamOf.get(issue.workspace_id) ?? null) : null,
          ninetyUserOf,
          fallbackOwner: owner,
          issueUrl: (i) => `${appUrl}/t/${slug}/w/${i.workspace_id}/issues/${i.number}`,
        })
        if (discuss.kind === 'create') {
          const created = await ninety.createIssue({ ...discuss.body, interval: 'SHORT_TERM' })
          must(await admin.from('ninety_issue_links').insert({ issue_id: issueId, team_id: teamId, ninety_issue_id: created._id, sent_hash: discuss.hash, completed: false }))
          sent = true
        } else if (discuss.kind === 'update') {
          await ninety.updateIssue(discuss.ninetyIssueId, discuss.body)
          must(await admin.from('ninety_issue_links').update({ sent_hash: discuss.hash, completed: discuss.completed, synced_at: new Date().toISOString() }).eq('issue_id', issueId))
          sent = true
        } else if (discuss.kind === 'delete') {
          await ninety.deleteIssue(discuss.ninetyIssueId)
          must(await admin.from('ninety_issue_links').delete().eq('issue_id', issueId))
          sent = true
        }
        return sent
      })
      if (!goOn) break
    }
  }

  return finish()

  async function finish() {
    await admin
      .from('ninety_connections')
      .update(outcome.stopped ? { last_sync_at: new Date().toISOString() } : { last_sync_at: new Date().toISOString(), last_error: null, last_error_at: null })
      .eq('team_id', teamId)
    return outcome
  }
}

async function recordConnectionError(admin: SupabaseClient, teamId: string, e: unknown) {
  const message =
    e instanceof NinetyError && (e.status === 401 || e.status === 403)
      ? 'Ninety refused the token. It may have expired, or the account lost API access. Connect again with a new token.'
      : 'Ninety could not be reached. DevDock will try again.'
  console.error('[ninety] connection', teamId, e)
  await admin.from('ninety_connections').update({ last_error: message, last_error_at: new Date().toISOString() }).eq('team_id', teamId)
}

/** The Ninety page: anyone in the group (items from issues they can't open are left out). */
async function overview(req: Request, body: Record<string, unknown>) {
  const { teamId, db } = await requireGroupAdmin(req, body.teamId, true)
  const admin = service()
  const { data: token } = await admin.rpc('ninety_token', { p_team: teamId })
  if (typeof token !== 'string' || !token) return { connected: false }
  const { data: team } = await admin.from('teams').select('slug').eq('id', teamId).single()
  return await buildOverview({ admin, viewer: db, ninety: ninetyClient(token), teamId, slug: (team as { slug: string }).slug })
}

/**
 * "Sync now" on the Ninety page: sends what is already waiting (nothing is re-queued), for anyone in the
 * group. With nothing waiting it makes no Ninety call.
 */
async function sendWaiting(req: Request, body: Record<string, unknown>) {
  const { teamId } = await requireGroupAdmin(req, body.teamId, true)
  const admin = service()
  await tokenOf(admin, teamId)
  return await drainTeam(admin, teamId, Date.now() + RUN_BUDGET_MS, true)
}

async function syncNow(req: Request, body: Record<string, unknown>) {
  const { teamId } = await requireGroupAdmin(req, body.teamId)
  const admin = service()
  await tokenOf(admin, teamId)
  await admin.rpc('ninety_queue_team_now', { p_team: teamId })
  return await drainTeam(admin, teamId, Date.now() + RUN_BUDGET_MS, true)
}

async function drainAll(req: Request) {
  const admin = service()
  const given = req.headers.get('x-ninety-cron') ?? ''
  const { data: secret } = await admin.rpc('ninety_cron_secret')
  if (typeof secret !== 'string' || !secret || given.length !== secret.length || given !== secret) throw new HttpError(401, 'unauthorized')

  const [{ data: rows }, { data: planRows }] = await Promise.all([
    admin.from('ninety_outbox').select('team_id').lt('attempts', MAX_ATTEMPTS).limit(1000),
    admin.from('ninety_plan_outbox').select('team_id').lt('attempts', MAX_ATTEMPTS).limit(1000),
  ])
  const teams = [...new Set([...(rows ?? []), ...(planRows ?? [])].map((r) => r.team_id as string))]
  const deadline = Date.now() + RUN_BUDGET_MS
  const total = { teams: teams.length, sent: 0, failed: 0 }
  for (const teamId of teams) {
    if (Date.now() > deadline) break
    try {
      const r = await drainTeam(admin, teamId, deadline, false)
      total.sent += r.sent
      total.failed += r.failed
    } catch (e) {
      console.error('[ninety] team', teamId, e)
    }
  }
  return total
}

// ------------------------------------------------------------------------------------------------ entry

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  let body: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(await req.text())
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  try {
    switch (body.action) {
      case 'connect':
        return json(await connect(req, body))
      case 'teams':
        return json(await listTeams(req, body))
      case 'sync':
        return json(await syncNow(req, body))
      case 'overview':
        return json(await overview(req, body))
      case 'send':
        return json(await sendWaiting(req, body))
      case 'drain':
        return json(await drainAll(req))
      default:
        return json({ error: 'bad_request' }, 400)
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code }, e.status)
    console.error('[ninety] unexpected', e)
    return json({ error: 'internal' }, 500)
  }
})
