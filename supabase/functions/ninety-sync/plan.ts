// What one DevDock issue's Ninety To-Do should be. Pure (no network, no database), so the rules are
// tested on their own (plan.test.ts) and the function only carries them out.

export type IssueRow = {
  id: string
  number: number
  title: string
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled'
  assignee_id: string | null
  due_date: string | null
  workspace_id: string
  issue_key: string
  cycle: { starts_on: string; ends_on: string } | null
}

export type Link = { ninety_todo_id: string; sent_hash: string; completed: boolean }

export type TodoBody = {
  title: string
  description: string
  teamId: string
  userId: string
  dueDate: string
  completed: boolean
}

export type Step =
  | { kind: 'none' }
  | { kind: 'create'; body: TodoBody; hash: string }
  | { kind: 'update'; todoId: string; body: Partial<TodoBody>; hash: string; completed: boolean }
  | { kind: 'delete'; todoId: string }

export type PlanInput = {
  /** null: the issue was deleted. */
  issue: IssueRow | null
  link: Link | null
  /** The Ninety team the issue's project is linked to, if any. */
  ninetyTeamId: string | null
  /** DevDock user id → Ninety user id, for people matched by email. */
  ninetyUserOf: (userId: string) => string | null
  /** Name to add to the title when the assignee isn't in Ninety. */
  nameOf: (userId: string) => string
  /** Ninety user who owns To-Dos for people not in Ninety. */
  fallbackOwner: string
  /** "YYYY-MM-DD", the day the sprint test is made against. */
  today: string
  /** Link back to the issue in DevDock. */
  issueUrl: (issue: IssueRow) => string
}

const CLOSED = new Set(['done', 'canceled'])
const TITLE_MAX = 250

/** A short, stable fingerprint of what was sent, so an unchanged To-Do isn't sent again. */
export function hashOf(body: TodoBody): string {
  const text = JSON.stringify([body.title, body.description, body.teamId, body.userId, body.dueDate, body.completed])
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0') + ':' + text.length
}

export function inSprint(issue: IssueRow, today: string): boolean {
  return issue.cycle !== null && issue.cycle.starts_on <= today && today <= issue.cycle.ends_on
}

export function todoBody(input: PlanInput & { issue: IssueRow; ninetyTeamId: string }): TodoBody {
  const { issue } = input
  const assignee = issue.assignee_id!
  const matched = input.ninetyUserOf(assignee)
  const key = `${issue.issue_key}-${issue.number}`
  const forWho = matched ? '' : ` (for ${input.nameOf(assignee)})`
  const title = `${key} ${issue.title}`.slice(0, TITLE_MAX - forWho.length) + forWho
  return {
    title,
    description: `From DevDock: ${input.issueUrl(issue)}\nManaged by DevDock: changes made here are replaced by the issue's.`,
    teamId: input.ninetyTeamId,
    userId: matched ?? input.fallbackOwner,
    // The issue's due date, else the end of its sprint (a To-Do in Ninety always has one).
    dueDate: issue.due_date ?? issue.cycle!.ends_on,
    completed: CLOSED.has(issue.status),
  }
}

export function plan(input: PlanInput): Step {
  const { issue, link } = input

  // Deleted issue: its To-Do goes too.
  if (!issue) return link ? { kind: 'delete', todoId: link.ninety_todo_id } : { kind: 'none' }

  const wanted = input.ninetyTeamId !== null && issue.assignee_id !== null && inSprint(issue, input.today)

  if (!wanted) {
    // Out of the sprint, unassigned or its project unlinked: the To-Do is finished, not deleted.
    if (link && !link.completed) return { kind: 'update', todoId: link.ninety_todo_id, body: { completed: true }, hash: link.sent_hash, completed: true }
    return { kind: 'none' }
  }

  const body = todoBody({ ...input, issue, ninetyTeamId: input.ninetyTeamId! })
  const hash = hashOf(body)
  if (!link) {
    // Never create a To-Do for work that is already finished.
    return body.completed ? { kind: 'none' } : { kind: 'create', body, hash }
  }
  if (link.sent_hash === hash && link.completed === body.completed) return { kind: 'none' }
  return { kind: 'update', todoId: link.ninety_todo_id, body, hash, completed: body.completed }
}

// ------------------------------------------------------------------------------------------------ phase 2: Rocks and Milestones

export type PlanRow = {
  id: string
  name: string
  status: 'not_started' | 'in_progress' | 'paused' | 'done' | 'canceled'
  lead_id: string | null
  target_on: string | null
}

export type RockLink = { ninety_rock_id: string; sent_hash: string }

export type RockBody = {
  title: string
  description: string
  teamId: string
  userId: string
  dueDate: string
  statusCode: 'ON_TRACK' | 'OFF_TRACK' | 'DONE' | 'CANCELED'
  levelCode: 'DEPARTMENT'
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
}

export type RockStep =
  | { kind: 'none' }
  | { kind: 'create'; body: RockBody; hash: string }
  | { kind: 'update'; rockId: string; body: RockBody; hash: string }
  | { kind: 'delete'; rockId: string }

export type RockInput = {
  /** null: the plan was deleted. */
  plan: PlanRow | null
  link: RockLink | null
  /** The Ninety team that gets the group's Rocks; null = no Rocks. */
  rocksTeamId: string | null
  ninetyUserOf: (userId: string) => string | null
  fallbackOwner: string
  today: string
  planUrl: (plan: PlanRow) => string
}

const ROCK_TITLE_MAX = 250

export function quarterOf(date: string): RockBody['quarter'] {
  return `Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}` as RockBody['quarter']
}

export function rockStatus(plan: PlanRow, today: string): RockBody['statusCode'] {
  if (plan.status === 'done') return 'DONE'
  if (plan.status === 'canceled') return 'CANCELED'
  if (plan.status === 'paused' || (plan.target_on !== null && plan.target_on < today)) return 'OFF_TRACK'
  return 'ON_TRACK'
}

export function rockHash(body: RockBody): string {
  return hashOf({
    title: body.title,
    description: body.description,
    teamId: body.teamId,
    userId: body.userId,
    dueDate: body.dueDate,
    completed: false,
  }) + `:${body.statusCode}:${body.quarter}`
}

/** What a plan's Rock should be. A plan needs a target date to be a Rock (Ninety requires a due date). */
export function rockPlan(input: RockInput): RockStep {
  const { plan, link } = input
  if (!plan) return link ? { kind: 'delete', rockId: link.ninety_rock_id } : { kind: 'none' }
  // No Rocks team, or no target date: leave whatever is in Ninety alone.
  if (input.rocksTeamId === null || plan.target_on === null) return { kind: 'none' }

  const owner = (plan.lead_id && input.ninetyUserOf(plan.lead_id)) || input.fallbackOwner
  const body: RockBody = {
    title: plan.name.slice(0, ROCK_TITLE_MAX),
    description: `From DevDock: ${input.planUrl(plan)}\nManaged by DevDock: changes made here are replaced by the plan's.`,
    teamId: input.rocksTeamId,
    userId: owner,
    dueDate: plan.target_on,
    statusCode: rockStatus(plan, input.today),
    levelCode: 'DEPARTMENT',
    quarter: quarterOf(plan.target_on),
  }
  const hash = rockHash(body)
  if (!link) {
    // A plan that is already over doesn't become a new Rock.
    return plan.status === 'done' || plan.status === 'canceled' ? { kind: 'none' } : { kind: 'create', body, hash }
  }
  return link.sent_hash === hash ? { kind: 'none' } : { kind: 'update', rockId: link.ninety_rock_id, body, hash }
}

export type MilestoneLink = { ninety_milestone_id: string; ninety_rock_id: string; sent_hash: string; removed: boolean }

export type MilestoneBody = { title: string; dueDate: string; ownedByUserId: string; isDone: boolean }

export type MilestoneStep =
  | { kind: 'create'; rockId: string; body: MilestoneBody; hash: string }
  | { kind: 'update'; milestoneId: string; body: MilestoneBody; hash: string }
  /** Ninety can't delete a Milestone: it is completed and marked "(removed)". */
  | { kind: 'remove'; milestoneId: string; body: Partial<MilestoneBody> }

export type MilestoneInput = {
  issue: (IssueRow & { plan_id: string | null }) | null
  link: MilestoneLink | null
  /** The Rock of a plan, if it has one. */
  rockOf: (planId: string) => string | null
  ninetyUserOf: (userId: string) => string | null
  fallbackOwner: string
}

/** What an issue's Milestone should be: issues in a plan with a Rock that have a due date. Can be two steps (moved plans). */
export function milestonePlan(input: MilestoneInput): MilestoneStep[] {
  const { issue, link } = input
  const rockId = issue?.plan_id ? input.rockOf(issue.plan_id) : null
  const wanted = issue !== null && rockId !== null && issue.due_date !== null && issue.status !== 'canceled'
  const steps: MilestoneStep[] = []
  const label = issue ? `${issue.issue_key}-${issue.number} ${issue.title}`.slice(0, 240) : null

  // Its Milestone belongs to another Rock now, or shouldn't exist: retire it (once).
  if (link && !link.removed && (!wanted || link.ninety_rock_id !== rockId)) {
    steps.push({ kind: 'remove', milestoneId: link.ninety_milestone_id, body: label ? { isDone: true, title: `${label} (removed)` } : { isDone: true } })
  }
  if (!wanted) return steps

  const assignee = issue.assignee_id
  const body: MilestoneBody = {
    title: label!,
    dueDate: issue.due_date!,
    ownedByUserId: (assignee && input.ninetyUserOf(assignee)) || input.fallbackOwner,
    isDone: issue.status === 'done',
  }
  const hash = hashOf({ title: body.title, description: '', teamId: rockId!, userId: body.ownedByUserId, dueDate: body.dueDate, completed: body.isDone })
  if (link && !link.removed && link.ninety_rock_id === rockId) {
    if (link.sent_hash !== hash) steps.push({ kind: 'update', milestoneId: link.ninety_milestone_id, body, hash })
  } else if (!body.isDone) {
    // A new Milestone only for work not yet done.
    steps.push({ kind: 'create', rockId: rockId!, body, hash })
  }
  return steps
}

// ------------------------------------------------------------------------------------------------ phase 3: Issues (IDS)

export type IdsLink = { ninety_issue_id: string; sent_hash: string; completed: boolean }

export type IdsBody = { title: string; description: string; teamId: string; userId: string; completed: boolean }

export type IdsStep =
  | { kind: 'none' }
  | { kind: 'create'; body: IdsBody; hash: string }
  | { kind: 'update'; ninetyIssueId: string; body: Partial<IdsBody>; hash: string; completed: boolean }
  | { kind: 'delete'; ninetyIssueId: string }

export type IdsInput = {
  issue: IssueRow | null
  link: IdsLink | null
  /** The issue carries the IDS label. */
  labelled: boolean
  ninetyTeamId: string | null
  ninetyUserOf: (userId: string) => string | null
  fallbackOwner: string
  issueUrl: (issue: IssueRow) => string
}

/** What an issue's Ninety Issue should be: labelled IDS, in a linked project. */
export function idsPlan(input: IdsInput): IdsStep {
  const { issue, link } = input
  if (!issue) return link ? { kind: 'delete', ninetyIssueId: link.ninety_issue_id } : { kind: 'none' }

  if (!input.labelled || input.ninetyTeamId === null) {
    // Label taken off, or the project unlinked: the team has dealt with it (solved), not deleted.
    if (link && !link.completed) return { kind: 'update', ninetyIssueId: link.ninety_issue_id, body: { completed: true }, hash: link.sent_hash, completed: true }
    return { kind: 'none' }
  }

  const owner = (issue.assignee_id && input.ninetyUserOf(issue.assignee_id)) || input.fallbackOwner
  const body: IdsBody = {
    title: `${issue.issue_key}-${issue.number} ${issue.title}`.slice(0, TITLE_MAX),
    description: `From DevDock: ${input.issueUrl(issue)}\nManaged by DevDock: changes made here are replaced by the issue's.`,
    teamId: input.ninetyTeamId,
    userId: owner,
    completed: CLOSED.has(issue.status),
  }
  const hash = hashOf({ ...body, dueDate: '' })
  if (!link) return body.completed ? { kind: 'none' } : { kind: 'create', body, hash }
  if (link.sent_hash === hash && link.completed === body.completed) return { kind: 'none' }
  return { kind: 'update', ninetyIssueId: link.ninety_issue_id, body, hash, completed: body.completed }
}
