// A throwaway group on the LOCAL Supabase stack for the tool tests: four
// people, two projects, issues, meetings and conversations, all created the
// way the app creates them and removed afterwards.
//
// It refuses to run against anything but localhost. The service-role key is
// the local stack's and is used only to make and remove the fixtures (and for
// ai_pending_actions, as in the function); every tool call runs as one of the
// test people under RLS.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { AiExecutionContext, AiToolResult } from '../agent/types.ts'

const url = Deno.env.get('AI_TEST_SUPABASE_URL')
const anonKey = Deno.env.get('AI_TEST_ANON_KEY')
const serviceKey = Deno.env.get('AI_TEST_SERVICE_ROLE_KEY')

/** The local-database tests are skipped unless tests/run-local.sh supplied the local stack. */
export const localStack = Boolean(url && anonKey && serviceKey)

if (localStack && !['127.0.0.1', 'localhost'].includes(new URL(url!).hostname)) {
  throw new Error('The AI tool tests only run against the local Supabase stack (127.0.0.1). Refusing to touch a hosted project.')
}

const options = { auth: { persistSession: false, autoRefreshToken: false } }

export type TestPerson = { id: string; name: string; db: SupabaseClient }

export type Fixture = {
  admin: SupabaseClient
  teamId: string
  owner: TestPerson
  /** In the group and in project Alpha. */
  kumar: TestPerson
  /** In the group, in no project. */
  reddy: TestPerson
  /** Not in the group at all. */
  outsider: TestPerson
  alpha: { id: string; key: string }
  beta: { id: string; key: string }
  meetings: { group: string; alpha: string; beta: string }
  conversations: { general: string; ownerKumar: string; kumarReddy: string }
  functionCalls: { name: string; body: Record<string, unknown> }[]
  context: (person: TestPerson, overrides?: Partial<AiExecutionContext>) => AiExecutionContext
  cleanup: () => Promise<void>
}

function must(result: { data: unknown; error: { message: string } | null }, what: string): unknown {
  if (result.error || result.data === null) throw new Error(`fixture: ${what} failed: ${result.error?.message ?? 'no data'}`)
  return result.data
}

export async function createFixture(): Promise<Fixture> {
  const admin = createClient(url!, serviceKey!, options)
  const tag = crypto.randomUUID().slice(0, 8)
  const password = crypto.randomUUID()

  async function person(name: string): Promise<TestPerson> {
    const email = `zz-ai-${tag}-${name.toLowerCase().replace(/\s+/g, '-')}@example.test`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } })
    if (created.error || !created.data.user) throw new Error(`fixture: create user failed: ${created.error?.message}`)
    const db = createClient(url!, anonKey!, options)
    const signedIn = await db.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw new Error(`fixture: sign in failed: ${signedIn.error.message}`)
    return { id: created.data.user.id, name, db }
  }

  const owner = await person('Zed Owner')
  const kumar = await person('Sree Kumar')
  const reddy = await person('Sree Reddy')
  const outsider = await person('Olive Outsider')
  const people = [owner, kumar, reddy, outsider]

  const cleanup = async () => {
    await admin.from('teams').delete().like('slug', `zz-ai-${tag}%`)
    for (const p of people) await admin.auth.admin.deleteUser(p.id)
  }

  try {
    const team = must(await owner.db.from('teams').insert({ name: `ZZ AI ${tag}`, slug: `zz-ai-${tag}`, type: 'general' }).select('id').single(), 'create group')
    const teamId = (team as { id: string }).id
    must(await admin.from('team_members').insert([kumar, reddy].map((p) => ({ team_id: teamId, user_id: p.id, role: 'member' }))).select('user_id'), 'add members')

    async function project(title: string) {
      const id = must(
        await owner.db.rpc('create_workspace_in', { p_team_id: teamId, p_title: title, p_description: '', p_type: 'project', p_modules: ['issues', 'live'], p_access: 'members', p_collection_id: null }),
        `create ${title}`,
      ) as string
      const row = must(await owner.db.from('workspaces').select('issue_key').eq('id', id).single(), 'read key') as { issue_key: string }
      return { id, key: row.issue_key }
    }
    const alpha = await project('Alpha Rocket')
    const beta = await project('Beta Garden')
    must(await admin.from('workspace_members').insert({ workspace_id: alpha.id, user_id: kumar.id, role: 'member' }).select('user_id'), 'add Kumar to Alpha')

    const issue = (workspace_id: string, title: string, extra: Record<string, unknown> = {}) => ({ workspace_id, title, status: 'todo', priority: 0, ...extra })
    must(
      await owner.db
        .from('issues')
        .insert([
          issue(alpha.id, 'Fix login redirect', { assignee_id: kumar.id, priority: 2, due_date: '2026-10-14' }),
          issue(alpha.id, 'Login page styling'),
          issue(alpha.id, 'Write release notes', { status: 'done' }),
        ])
        .select('id'),
      'create Alpha issues',
    )
    must(await owner.db.from('issues').insert(issue(beta.id, 'Water the plants')).select('id'), 'create Beta issue')

    const hour = 3_600_000
    const at = (ms: number) => new Date(Date.now() + ms).toISOString()
    async function meeting(workspace_id: string | null, title: string, startsIn: number) {
      const row = must(
        await owner.db.from('live_sessions').insert({ team_id: teamId, workspace_id, title, description: 'Agenda: plans.', starts_at: at(startsIn), ends_at: at(startsIn + hour) }).select('id').single(),
        `schedule ${title}`,
      )
      return (row as { id: string }).id
    }
    const meetings = {
      group: await meeting(null, 'Group sync', hour),
      alpha: await meeting(alpha.id, 'Alpha review', 2 * hour),
      beta: await meeting(beta.id, 'Beta planning', 3 * hour),
    }

    must(await owner.db.rpc('ensure_general_channel', { p_team_id: teamId }).then((r) => ({ data: r.error ? null : true, error: r.error })), 'general channel')
    const general = must(await owner.db.from('conversations').select('id').eq('team_id', teamId).eq('kind', 'channel').limit(1).single(), 'find #general') as { id: string }
    const ownerKumar = must(await owner.db.rpc('create_direct_conversation', { p_team_id: teamId, p_user_id: kumar.id }), 'owner–Kumar DM') as string
    const kumarReddy = must(await kumar.db.rpc('create_direct_conversation', { p_team_id: teamId, p_user_id: reddy.id }), 'Kumar–Reddy DM') as string

    const functionCalls: Fixture['functionCalls'] = []
    return {
      admin,
      teamId,
      owner,
      kumar,
      reddy,
      outsider,
      alpha,
      beta,
      meetings,
      conversations: { general: general.id, ownerKumar, kumarReddy },
      functionCalls,
      cleanup,
      context: (p, overrides = {}) => ({
        requestId: 'test',
        userId: p.id,
        userName: p.name,
        teamId,
        teamName: `ZZ AI ${tag}`,
        currentTime: new Date().toISOString(),
        timeZone: 'UTC',
        db: p.db,
        // Records the call instead of reaching GitHub.
        callFunction: (name, body) => {
          functionCalls.push({ name, body })
          return Promise.resolve({ success: true, data: { branch: { name: 'dock/test-branch', base: 'main' }, created: true } })
        },
        ...overrides,
      }),
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

export function data<T = Record<string, unknown>>(result: AiToolResult): T {
  if (!result.success) throw new Error(`expected success, got ${result.code}: ${result.message}`)
  return result.data as T
}

export function code(result: AiToolResult): string {
  return result.success ? 'OK' : result.code
}
