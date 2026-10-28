// deno test supabase/functions/ninety-sync/plan.test.ts
import { assertEquals } from 'jsr:@std/assert@1'
import { hashOf, idsPlan, milestonePlan, plan, quarterOf, rockPlan, rockStatus, todoBody, type IdsInput, type IssueRow, type MilestoneInput, type PlanInput, type PlanRow, type RockInput } from './plan.ts'

const issue = (over: Partial<IssueRow> = {}): IssueRow => ({
  id: 'i1',
  number: 12,
  title: 'Add login',
  status: 'todo',
  assignee_id: 'u-kumar',
  due_date: null,
  workspace_id: 'w1',
  issue_key: 'WA',
  cycle: { starts_on: '2026-10-26', ends_on: '2026-11-08' },
  ...over,
})

const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  issue: issue(),
  link: null,
  ninetyTeamId: 'nt1',
  ninetyUserOf: (id) => (id === 'u-kumar' ? 'n-kumar' : null),
  nameOf: (id) => (id === 'u-reddy' ? 'Sree Reddy' : 'Someone'),
  fallbackOwner: 'n-owner',
  today: '2026-10-28',
  issueUrl: (i) => `https://dev-dock.com/t/g/w/${i.workspace_id}/issues/${i.number}`,
  ...over,
})

Deno.test('an assigned issue in the running sprint becomes a To-Do', () => {
  const step = plan(base())
  assertEquals(step.kind, 'create')
  if (step.kind !== 'create') return
  assertEquals(step.body.title, 'WA-12 Add login')
  assertEquals(step.body.userId, 'n-kumar')
  assertEquals(step.body.teamId, 'nt1')
  // No due date on the issue: the sprint's end.
  assertEquals(step.body.dueDate, '2026-11-08')
  assertEquals(step.body.completed, false)
  assertEquals(step.body.description.startsWith('From DevDock: https://dev-dock.com/t/g/w/w1/issues/12'), true)
})

Deno.test('the issue due date wins over the sprint end', () => {
  const step = plan(base({ issue: issue({ due_date: '2026-10-30' }) }))
  assertEquals(step.kind === 'create' && step.body.dueDate, '2026-10-30')
})

Deno.test('an assignee not in Ninety: the fallback owner, with their name in the title', () => {
  const step = plan(base({ issue: issue({ assignee_id: 'u-reddy' }) }))
  assertEquals(step.kind === 'create' && step.body.userId, 'n-owner')
  assertEquals(step.kind === 'create' && step.body.title, 'WA-12 Add login (for Sree Reddy)')
})

Deno.test('nothing is created for unassigned, out-of-sprint, unlinked or finished issues', () => {
  assertEquals(plan(base({ issue: issue({ assignee_id: null }) })).kind, 'none')
  assertEquals(plan(base({ issue: issue({ cycle: null }) })).kind, 'none')
  assertEquals(plan(base({ issue: issue({ cycle: { starts_on: '2026-11-09', ends_on: '2026-11-22' } }) })).kind, 'none')
  assertEquals(plan(base({ issue: issue({ cycle: { starts_on: '2026-10-12', ends_on: '2026-10-25' } }) })).kind, 'none')
  assertEquals(plan(base({ ninetyTeamId: null })).kind, 'none')
  assertEquals(plan(base({ issue: issue({ status: 'done' }) })).kind, 'none')
  assertEquals(plan(base({ issue: issue({ status: 'canceled' }) })).kind, 'none')
})

Deno.test('the sprint includes its first and last day', () => {
  assertEquals(plan(base({ today: '2026-10-26' })).kind, 'create')
  assertEquals(plan(base({ today: '2026-11-08' })).kind, 'create')
  assertEquals(plan(base({ today: '2026-11-09' })).kind, 'none')
})

Deno.test('an unchanged issue sends nothing; a change sends an update', () => {
  const first = plan(base())
  if (first.kind !== 'create') throw new Error('expected create')
  const link = { ninety_todo_id: 't1', sent_hash: first.hash, completed: false }
  assertEquals(plan(base({ link })).kind, 'none')
  const renamed = plan(base({ link, issue: issue({ title: 'Add login page' }) }))
  assertEquals(renamed.kind, 'update')
  assertEquals(renamed.kind === 'update' && renamed.body.title, 'WA-12 Add login page')
  // Reassigned to someone else in Ninety's terms (not matched): owner changes.
  const moved = plan(base({ link, issue: issue({ assignee_id: 'u-reddy' }) }))
  assertEquals(moved.kind === 'update' && moved.body.userId, 'n-owner')
})

Deno.test('done or canceled completes the To-Do; reopening un-completes it', () => {
  const first = plan(base())
  if (first.kind !== 'create') throw new Error('expected create')
  const link = { ninety_todo_id: 't1', sent_hash: first.hash, completed: false }
  const done = plan(base({ link, issue: issue({ status: 'done' }) }))
  assertEquals(done.kind === 'update' && done.completed, true)
  if (done.kind !== 'update') return
  const doneLink = { ninety_todo_id: 't1', sent_hash: done.hash, completed: true }
  assertEquals(plan(base({ link: doneLink, issue: issue({ status: 'done' }) })).kind, 'none')
  const reopened = plan(base({ link: doneLink, issue: issue({ status: 'in_progress' }) }))
  assertEquals(reopened.kind === 'update' && reopened.completed, false)
})

Deno.test('leaving the sprint, unassigning or unlinking completes it, once', () => {
  const link = { ninety_todo_id: 't1', sent_hash: 'h', completed: false }
  for (const over of [{ issue: issue({ cycle: null }) }, { issue: issue({ assignee_id: null }) }, { ninetyTeamId: null }]) {
    const step = plan(base({ link, ...over }))
    assertEquals(step.kind === 'update' && step.body, { completed: true })
  }
  assertEquals(plan(base({ link: { ...link, completed: true }, issue: issue({ cycle: null }) })).kind, 'none')
})

Deno.test('a deleted issue deletes its To-Do; with no To-Do there is nothing to do', () => {
  assertEquals(plan(base({ issue: null, link: { ninety_todo_id: 't1', sent_hash: 'h', completed: false } })), { kind: 'delete', todoId: 't1' })
  assertEquals(plan(base({ issue: null })).kind, 'none')
})

Deno.test('long titles are cut so the name still fits', () => {
  const body = todoBody({ ...base(), issue: issue({ title: 'x'.repeat(400), assignee_id: 'u-reddy' }), ninetyTeamId: 'nt1' })
  assertEquals(body.title.length, 250)
  assertEquals(body.title.endsWith(' (for Sree Reddy)'), true)
})

Deno.test('the hash changes with every sent field', () => {
  const body = todoBody({ ...base(), issue: issue(), ninetyTeamId: 'nt1' })
  const h = hashOf(body)
  for (const change of [{ title: 'y' }, { description: 'y' }, { teamId: 'y' }, { userId: 'y' }, { dueDate: '2026-01-01' }, { completed: true }]) {
    assertEquals(hashOf({ ...body, ...change }) === h, false)
  }
})

// ------------------------------------------------------------------------------------------------ Rocks

const planRow = (over: Partial<PlanRow> = {}): PlanRow => ({ id: 'p1', name: 'Custom auth roles', status: 'in_progress', lead_id: 'u-kumar', target_on: '2026-12-15', ...over })
const rockBase = (over: Partial<RockInput> = {}): RockInput => ({
  plan: planRow(),
  link: null,
  rocksTeamId: 'nt1',
  ninetyUserOf: (id) => (id === 'u-kumar' ? 'n-kumar' : null),
  fallbackOwner: 'n-owner',
  today: '2026-10-28',
  planUrl: (p) => `https://dev-dock.com/t/g/issues/plans/${p.id}`,
  ...over,
})

Deno.test('a plan with a target date becomes a Rock', () => {
  const step = rockPlan(rockBase())
  assertEquals(step.kind, 'create')
  if (step.kind !== 'create') return
  assertEquals(step.body.title, 'Custom auth roles')
  assertEquals(step.body.userId, 'n-kumar')
  assertEquals(step.body.dueDate, '2026-12-15')
  assertEquals(step.body.quarter, 'Q4')
  assertEquals(step.body.statusCode, 'ON_TRACK')
  assertEquals(step.body.levelCode, 'DEPARTMENT')
  assertEquals(step.body.description.startsWith('From DevDock: https://dev-dock.com/t/g/issues/plans/p1'), true)
})

Deno.test('Rock owner: the lead, else the fallback owner', () => {
  assertEquals(rockPlan(rockBase({ plan: planRow({ lead_id: 'u-reddy' }) })).kind === 'create' && (rockPlan(rockBase({ plan: planRow({ lead_id: 'u-reddy' }) })) as { body: { userId: string } }).body.userId, 'n-owner')
  assertEquals((rockPlan(rockBase({ plan: planRow({ lead_id: null }) })) as { body: { userId: string } }).body.userId, 'n-owner')
})

Deno.test('quarters and statuses', () => {
  assertEquals(['2026-01-01', '2026-03-31', '2026-04-01', '2026-06-30', '2026-07-15', '2026-09-30', '2026-10-01', '2026-12-31'].map(quarterOf), ['Q1', 'Q1', 'Q2', 'Q2', 'Q3', 'Q3', 'Q4', 'Q4'])
  const t = '2026-10-28'
  assertEquals(rockStatus(planRow({ status: 'not_started' }), t), 'ON_TRACK')
  assertEquals(rockStatus(planRow({ status: 'in_progress' }), t), 'ON_TRACK')
  assertEquals(rockStatus(planRow({ status: 'paused' }), t), 'OFF_TRACK')
  assertEquals(rockStatus(planRow({ status: 'in_progress', target_on: '2026-10-27' }), t), 'OFF_TRACK')
  assertEquals(rockStatus(planRow({ status: 'in_progress', target_on: '2026-10-28' }), t), 'ON_TRACK')
  assertEquals(rockStatus(planRow({ status: 'done', target_on: '2026-10-01' }), t), 'DONE')
  assertEquals(rockStatus(planRow({ status: 'canceled' }), t), 'CANCELED')
})

Deno.test('no Rock without a target date, a Rocks team, or for a plan already over', () => {
  assertEquals(rockPlan(rockBase({ plan: planRow({ target_on: null }) })).kind, 'none')
  assertEquals(rockPlan(rockBase({ rocksTeamId: null })).kind, 'none')
  assertEquals(rockPlan(rockBase({ plan: planRow({ status: 'done' }) })).kind, 'none')
  assertEquals(rockPlan(rockBase({ plan: planRow({ status: 'canceled' }) })).kind, 'none')
})

Deno.test('a Rock is updated only when something it shows changed; done and canceled reach it', () => {
  const first = rockPlan(rockBase())
  if (first.kind !== 'create') throw new Error('expected create')
  const link = { ninety_rock_id: 'r1', sent_hash: first.hash }
  assertEquals(rockPlan(rockBase({ link })).kind, 'none')
  for (const change of [{ name: 'Renamed' }, { status: 'done' as const }, { status: 'canceled' as const }, { status: 'paused' as const }, { target_on: '2027-01-10' }, { lead_id: null }]) {
    const step = rockPlan(rockBase({ link, plan: planRow(change) }))
    assertEquals(step.kind, 'update', JSON.stringify(change))
  }
  assertEquals((rockPlan(rockBase({ link, plan: planRow({ target_on: '2027-01-10' }) })) as { body: { quarter: string } }).body.quarter, 'Q1')
  // Moving the Rocks team moves the Rock.
  assertEquals((rockPlan(rockBase({ link, rocksTeamId: 'nt2' })) as { body: { teamId: string } }).body.teamId, 'nt2')
})

Deno.test('a deleted plan deletes its Rock', () => {
  assertEquals(rockPlan(rockBase({ plan: null, link: { ninety_rock_id: 'r1', sent_hash: 'h' } })), { kind: 'delete', rockId: 'r1' })
  assertEquals(rockPlan(rockBase({ plan: null })).kind, 'none')
})

// ------------------------------------------------------------------------------------------------ Milestones

const msIssue = (over: Partial<IssueRow & { plan_id: string | null }> = {}) => ({ ...issue({ due_date: '2026-11-15' }), plan_id: 'p1', ...over })
const msBase = (over: Partial<MilestoneInput> = {}): MilestoneInput => ({
  issue: msIssue(),
  link: null,
  rockOf: (id) => (id === 'p1' ? 'r1' : id === 'p2' ? 'r2' : null),
  ninetyUserOf: (id) => (id === 'u-kumar' ? 'n-kumar' : null),
  fallbackOwner: 'n-owner',
  ...over,
})

Deno.test('an issue in a plan with a due date becomes a Milestone of its Rock', () => {
  const steps = milestonePlan(msBase())
  assertEquals(steps.length, 1)
  assertEquals(steps[0].kind, 'create')
  if (steps[0].kind !== 'create') return
  assertEquals(steps[0].rockId, 'r1')
  assertEquals(steps[0].body, { title: 'WA-12 Add login', dueDate: '2026-11-15', ownedByUserId: 'n-kumar', isDone: false })
})

Deno.test('no Milestone without a due date, a plan with a Rock, or for finished work', () => {
  assertEquals(milestonePlan(msBase({ issue: msIssue({ due_date: null }) })), [])
  assertEquals(milestonePlan(msBase({ issue: msIssue({ plan_id: null }) })), [])
  assertEquals(milestonePlan(msBase({ issue: msIssue({ plan_id: 'p9' }) })), [])
  assertEquals(milestonePlan(msBase({ issue: msIssue({ status: 'done' }) })), [])
  assertEquals(milestonePlan(msBase({ issue: msIssue({ status: 'canceled' }) })), [])
})

Deno.test('Milestone updates: unchanged sends nothing; done, renamed, new date or owner update it', () => {
  const [first] = milestonePlan(msBase())
  if (first.kind !== 'create') throw new Error('expected create')
  const link = { ninety_milestone_id: 'm1', ninety_rock_id: 'r1', sent_hash: first.hash, removed: false }
  assertEquals(milestonePlan(msBase({ link })), [])
  for (const change of [{ status: 'done' as const }, { title: 'Renamed' }, { due_date: '2026-11-20' }, { assignee_id: 'u-reddy' }]) {
    const steps = milestonePlan(msBase({ link, issue: msIssue(change) }))
    assertEquals(steps.map((s) => s.kind), ['update'], JSON.stringify(change))
  }
})

Deno.test('leaving the plan, losing the due date, canceling or deleting retires the Milestone once', () => {
  const link = { ninety_milestone_id: 'm1', ninety_rock_id: 'r1', sent_hash: 'h', removed: false }
  for (const over of [{ plan_id: null }, { due_date: null }, { status: 'canceled' as const }]) {
    const steps = milestonePlan(msBase({ link, issue: msIssue(over) }))
    assertEquals(steps, [{ kind: 'remove', milestoneId: 'm1', body: { isDone: true, title: 'WA-12 Add login (removed)' } }], JSON.stringify(over))
  }
  assertEquals(milestonePlan(msBase({ link, issue: null })), [{ kind: 'remove', milestoneId: 'm1', body: { isDone: true } }])
  assertEquals(milestonePlan(msBase({ link: { ...link, removed: true }, issue: msIssue({ plan_id: null }) })), [])
})

Deno.test('moving to another plan retires the old Milestone and makes a new one on the new Rock', () => {
  const link = { ninety_milestone_id: 'm1', ninety_rock_id: 'r1', sent_hash: 'h', removed: false }
  const steps = milestonePlan(msBase({ link, issue: msIssue({ plan_id: 'p2' }) }))
  assertEquals(steps.map((s) => s.kind), ['remove', 'create'])
  assertEquals(steps[1].kind === 'create' && steps[1].rockId, 'r2')
  // A retired Milestone whose issue comes back to its plan gets a fresh one.
  assertEquals(milestonePlan(msBase({ link: { ...link, removed: true } })).map((s) => s.kind), ['create'])
})

// ------------------------------------------------------------------------------------------------ IDS

const idsBase = (over: Partial<IdsInput> = {}): IdsInput => ({
  issue: issue({ cycle: null }),
  link: null,
  labelled: true,
  ninetyTeamId: 'nt1',
  ninetyUserOf: (id) => (id === 'u-kumar' ? 'n-kumar' : null),
  fallbackOwner: 'n-owner',
  issueUrl: (i) => `https://dev-dock.com/t/g/w/${i.workspace_id}/issues/${i.number}`,
  ...over,
})

Deno.test('an issue labelled IDS in a linked project becomes a Ninety Issue, sprint or not', () => {
  const step = idsPlan(idsBase())
  assertEquals(step.kind, 'create')
  if (step.kind !== 'create') return
  assertEquals(step.body.title, 'WA-12 Add login')
  assertEquals(step.body.userId, 'n-kumar')
  assertEquals(step.body.teamId, 'nt1')
  assertEquals(step.body.completed, false)
  // Unassigned: the fallback owner.
  assertEquals((idsPlan(idsBase({ issue: issue({ assignee_id: null }) })) as { body: { userId: string } }).body.userId, 'n-owner')
})

Deno.test('no Ninety Issue without the label, a linked project, or for finished work', () => {
  assertEquals(idsPlan(idsBase({ labelled: false })).kind, 'none')
  assertEquals(idsPlan(idsBase({ ninetyTeamId: null })).kind, 'none')
  assertEquals(idsPlan(idsBase({ issue: issue({ status: 'done' }) })).kind, 'none')
})

Deno.test('IDS updates: unchanged nothing; rename and done update; label off or unlinked solves; deleted deletes', () => {
  const first = idsPlan(idsBase())
  if (first.kind !== 'create') throw new Error('expected create')
  const link = { ninety_issue_id: 'ni1', sent_hash: first.hash, completed: false }
  assertEquals(idsPlan(idsBase({ link })).kind, 'none')
  assertEquals(idsPlan(idsBase({ link, issue: issue({ title: 'Renamed' }) })).kind, 'update')
  const done = idsPlan(idsBase({ link, issue: issue({ status: 'done' }) }))
  assertEquals(done.kind === 'update' && done.completed, true)
  assertEquals(idsPlan(idsBase({ link, labelled: false })), { kind: 'update', ninetyIssueId: 'ni1', body: { completed: true }, hash: first.hash, completed: true })
  assertEquals(idsPlan(idsBase({ link, ninetyTeamId: null })).kind, 'update')
  assertEquals(idsPlan(idsBase({ link: { ...link, completed: true }, labelled: false })).kind, 'none')
  assertEquals(idsPlan(idsBase({ link, issue: null })), { kind: 'delete', ninetyIssueId: 'ni1' })
  // Labelled again after being solved: reopened.
  const reopened = idsPlan(idsBase({ link: { ...link, completed: true } }))
  assertEquals(reopened.kind === 'update' && reopened.completed, false)
})
