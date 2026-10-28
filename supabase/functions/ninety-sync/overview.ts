// The Ninety page: what is in Ninety right now for a group's linked teams, read live, each item marked
// with the DevDock issue or plan it came from. One call from the browser; the Ninety reads run in parallel.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { userName, type NinetyClient, type NinetyRecord } from './ninety.ts'

export type Source = { kind: 'issue'; label: string; path: string } | { kind: 'plan'; label: string; path: string }

type Item = {
  id: string
  teamId: string
  title: string
  owner: string | null
  source: Source | null
}

export type Overview = {
  connected: true
  fetchedAt: string
  teams: { id: string; name: string }[]
  todos: (Item & { dueDate: string | null; completed: boolean })[]
  rocks: (Item & { dueDate: string | null; status: string; quarter: string | null; completed: boolean; milestones: (Item & { dueDate: string | null; done: boolean })[] })[]
  issues: (Item & { completed: boolean; term: string | null })[]
  headlines: (Item & { createdAt: string | null })[]
  scorecards: { teamId: string; periods: { label: string; start: string }[]; groups: { name: string; kpis: { title: string; unit: string | null; goal: string | null; scores: (string | null)[] }[] }[] }[]
  /** DevDock changes waiting for the next run (twice a day) or Sync now. */
  waiting: number
  /** For the page's "how it gets here" notes: which projects send where, and where plans go as Rocks. */
  projects: { name: string; team: string }[]
  rocksTeam: string | null
  /** Parts Ninety didn't answer for (the rest is still shown). */
  failed: string[]
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const idOf = (r: NinetyRecord) => String(r._id ?? r.id ?? '')

async function settle<T>(failed: string[], what: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch (e) {
    console.error('[ninety] overview', what, e)
    failed.push(what)
    return fallback
  }
}

export async function buildOverview(args: {
  admin: SupabaseClient
  /** The viewer's own client: items whose DevDock issue they can't open are left out. */
  viewer: SupabaseClient
  ninety: NinetyClient
  teamId: string
  slug: string
}): Promise<Overview> {
  const { admin, viewer, ninety, teamId, slug } = args
  const failed: string[] = []

  const [conn, maps, todoLinks, rockLinks, msLinks, idsLinks, issuesWaiting, plansWaiting] = await Promise.all([
    admin.from('ninety_connections').select('rocks_ninety_team_id, rocks_ninety_team_name').eq('team_id', teamId).single(),
    admin.from('ninety_workspace_teams').select('ninety_team_id, ninety_team_name, workspace:workspaces(title)').eq('team_id', teamId),
    admin.from('ninety_links').select('issue_id, ninety_todo_id').eq('team_id', teamId),
    admin.from('ninety_rock_links').select('plan_id, ninety_rock_id').eq('team_id', teamId),
    admin.from('ninety_milestone_links').select('issue_id, ninety_milestone_id').eq('team_id', teamId),
    admin.from('ninety_issue_links').select('issue_id, ninety_issue_id').eq('team_id', teamId),
    admin.from('ninety_outbox').select('issue_id', { count: 'exact', head: true }).eq('team_id', teamId),
    admin.from('ninety_plan_outbox').select('plan_id', { count: 'exact', head: true }).eq('team_id', teamId),
  ])
  const teams = new Map<string, string>()
  for (const m of (maps.data ?? []) as { ninety_team_id: string; ninety_team_name: string }[]) teams.set(m.ninety_team_id, m.ninety_team_name)
  const rocksTeam = conn.data as { rocks_ninety_team_id: string | null; rocks_ninety_team_name: string | null } | null
  if (rocksTeam?.rocks_ninety_team_id) teams.set(rocksTeam.rocks_ninety_team_id, rocksTeam.rocks_ninety_team_name ?? 'Rocks')
  const teamIds = [...teams.keys()]

  // Ninety → DevDock: which issue or plan each item came from.
  const issueOfNinety = new Map<string, string>()
  for (const l of (todoLinks.data ?? []) as { issue_id: string; ninety_todo_id: string }[]) issueOfNinety.set(l.ninety_todo_id, l.issue_id)
  for (const l of (msLinks.data ?? []) as { issue_id: string; ninety_milestone_id: string }[]) issueOfNinety.set(l.ninety_milestone_id, l.issue_id)
  for (const l of (idsLinks.data ?? []) as { issue_id: string; ninety_issue_id: string }[]) issueOfNinety.set(l.ninety_issue_id, l.issue_id)
  const planOfRock = new Map(((rockLinks.data ?? []) as { plan_id: string; ninety_rock_id: string }[]).map((l) => [l.ninety_rock_id, l.plan_id]))

  const issueIds = [...new Set(issueOfNinety.values())]
  const planIds = [...new Set(planOfRock.values())]

  // Everything from Ninety, and the DevDock names, at once. Issues are read as the viewer (RLS).
  const [users, perTeam, visibleIssues, plans] = await Promise.all([
    settle(failed, 'people', ninety.users(), []),
    Promise.all(
      teamIds.map(async (id) => {
        const [open, done, rocks, issues, headlines, scorecard] = await Promise.all([
          settle(failed, 'To-Dos', ninety.openTodos(id), [] as NinetyRecord[]),
          settle(failed, 'To-Dos', ninety.doneTodos(id), [] as NinetyRecord[]),
          settle(failed, 'Rocks', ninety.rocks(id), [] as NinetyRecord[]),
          settle(failed, 'Issues', ninety.issues(id), [] as NinetyRecord[]),
          settle(failed, 'Headlines', ninety.headlines(id), [] as NinetyRecord[]),
          settle(failed, 'Scorecard', ninety.scorecard(id), null as NinetyRecord | null),
        ])
        const milestones = await Promise.all(rocks.slice(0, 50).map((r) => settle(failed, 'Milestones', ninety.rockMilestones(idOf(r)), [] as NinetyRecord[])))
        return { id, open, done, rocks, issues, headlines, scorecard, milestones }
      }),
    ),
    issueIds.length
      ? viewer.from('issues').select('id, number, workspace_id, workspace:workspaces(issue_key)').in('id', issueIds)
      : Promise.resolve({ data: [] }),
    planIds.length ? admin.from('plans').select('id, name').in('id', planIds) : Promise.resolve({ data: [] }),
  ])

  const nameOf = new Map(users.map((u) => [u.id, userName(u)]))
  const owner = (r: NinetyRecord) => nameOf.get(String(r.userId ?? r.ownedByUserId ?? '')) ?? null
  const issueRefs = new Map(
    ((visibleIssues.data ?? []) as unknown as { id: string; number: number; workspace_id: string; workspace: { issue_key: string } | null }[]).map((i) => [
      i.id,
      { kind: 'issue' as const, label: `${i.workspace?.issue_key ?? 'ISSUE'}-${i.number}`, path: `/t/${slug}/w/${i.workspace_id}/issues/${i.number}` },
    ]),
  )
  const planRefs = new Map(((plans.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, { kind: 'plan' as const, label: p.name, path: `/t/${slug}/issues/plans/${p.id}` }]))

  /** null: made in Ninety. undefined: from a DevDock issue the viewer can't open, so left out. */
  const sourceOf = (ninetyId: string): Source | null | undefined => {
    const issue = issueOfNinety.get(ninetyId)
    if (issue) return issueRefs.get(issue) // undefined when hidden from the viewer
    const plan = planOfRock.get(ninetyId)
    if (plan) return planRefs.get(plan) ?? null
    return null
  }
  const item = (r: NinetyRecord, teamId: string): Item | null => {
    const id = idOf(r)
    const source = sourceOf(id)
    if (source === undefined) return null
    return { id, teamId, title: str(r.title) ?? '(untitled)', owner: owner(r), source }
  }
  const keep = <T>(v: T | null): v is T => v !== null

  const out: Overview = {
    connected: true,
    fetchedAt: new Date().toISOString(),
    teams: teamIds.map((id) => ({ id, name: teams.get(id)! })),
    todos: [],
    rocks: [],
    issues: [],
    headlines: [],
    scorecards: [],
    waiting: (issuesWaiting.count ?? 0) + (plansWaiting.count ?? 0),
    projects: ((maps.data ?? []) as unknown as { ninety_team_name: string; workspace: { title: string } | null }[])
      .map((m) => ({ name: m.workspace?.title ?? 'A project', team: m.ninety_team_name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    rocksTeam: rocksTeam?.rocks_ninety_team_name ?? null,
    failed: [...new Set(failed)],
  }
  for (const t of perTeam) {
    for (const r of [...t.open, ...t.done.filter((d) => !d.deleted)]) {
      const it = item(r, t.id)
      if (it) out.todos.push({ ...it, dueDate: str(r.dueDate), completed: r.completed === true })
    }
    t.rocks.forEach((r, i) => {
      if (r.deleted) return
      const it = item(r, t.id)
      if (!it) return
      out.rocks.push({
        ...it,
        dueDate: str(r.dueDate),
        status: str(r.statusCode) ?? 'ON_TRACK',
        quarter: str(r.quarter),
        completed: r.completed === true,
        milestones: (t.milestones[i] ?? [])
          .filter((m) => !m.isDeleted)
          .map((m) => {
            const mi = item(m, t.id)
            return mi ? { ...mi, dueDate: str(m.dueDate), done: m.isDone === true } : null
          })
          .filter(keep),
      })
    })
    for (const r of t.issues) {
      if (r.deleted || r.archived) continue
      const it = item(r, t.id)
      if (it) out.issues.push({ ...it, completed: r.completed === true, term: str(r.intervalCode) })
    }
    for (const r of t.headlines) {
      if (r.archived) continue
      const it = item(r, t.id)
      if (it) out.headlines.push({ ...it, createdAt: str(r.createdDate) })
    }
    if (t.scorecard) out.scorecards.push(scorecardOf(t.id, t.scorecard))
  }
  return out
}

/** The team's Scorecard, its last 5 weeks: each measurable's goal and scores, as text. */
function scorecardOf(teamId: string, s: NinetyRecord): Overview['scorecards'][number] {
  const periods = (Array.isArray(s.periods) ? (s.periods as NinetyRecord[]) : []).filter((p) => !p.isFuture).slice(-5)
  const starts = periods.map((p) => String(p.periodStartDate ?? '').slice(0, 10))
  const groups = (Array.isArray(s.groups) ? (s.groups as NinetyRecord[]) : []).map((g) => ({
    name: str(g.name) ?? 'Measurables',
    kpis: (Array.isArray(g.kpis) ? (g.kpis as NinetyRecord[]) : []).map((k) => {
      const scores = Array.isArray(k.scores) ? (k.scores as NinetyRecord[]) : []
      const byStart = new Map(scores.map((sc) => [String(sc.periodStartDate ?? '').slice(0, 10), sc.value ?? sc.score]))
      const goal = (k.goal ?? k.defaultGoal) as NinetyRecord | undefined
      return {
        title: str(k.title) ?? 'Measurable',
        unit: str(k.unit),
        goal: goal && goal.value !== undefined ? `${goal.orientation === 'lte' ? '≤' : '≥'} ${goal.value}` : null,
        scores: starts.map((d) => {
          const v = byStart.get(d)
          return v === undefined || v === null ? null : String(v)
        }),
      }
    }),
  }))
  return { teamId, periods: periods.map((p, i) => ({ label: str(p.label) ?? starts[i], start: starts[i] })), groups }
}
