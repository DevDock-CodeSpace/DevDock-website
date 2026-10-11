// Issues: search, read, create and update. Every query and write here is the
// one the Issues UI makes (src/features/issues/api.ts), as the caller, so RLS,
// the column grants and the check_issue trigger decide what is allowed.

import { isDate, isUuid } from '../agent/schema.ts'
import { localDate } from '../agent/time.ts'
import type { AiExecutionContext, AiToolResult } from '../agent/types.ts'
import { defineTool } from './registry.ts'
import { bestMatches, dbFailure, DENIED, docToText, fail, fold, likePattern, ok, textToDoc } from './shared.ts'

// tests/drift.test.ts fails when these stop matching the database enum and src/features/issues/meta.ts.
export const ISSUE_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'] as const
export type IssueStatus = (typeof ISSUE_STATUSES)[number]
export const STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  canceled: 'Canceled',
}
const OPEN: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'in_review']
const CLOSED: IssueStatus[] = ['done', 'canceled']

/** Linear's scale, as stored: 0 none, 1 urgent, 2 high, 3 medium, 4 low. */
export const PRIORITIES = { none: 0, urgent: 1, high: 2, medium: 3, low: 4 } as const
export type PriorityName = keyof typeof PRIORITIES
const PRIORITY_NAMES = Object.keys(PRIORITIES) as PriorityName[]
const priorityName = (value: number): PriorityName => PRIORITY_NAMES.find((name) => PRIORITIES[name] === value) ?? 'none'

// The messages the Issues UI shows for the same refusals (writeErrors in src/features/issues/api.ts).
const WRITE_ERRORS = {
  '42501': { code: 'PERMISSION_DENIED', message: 'You don’t have permission to change issues here.' },
  '23514': {
    code: 'NOT_ALLOWED',
    message: 'That change isn’t allowed. Assignees and repositories must belong to the issue’s project, and an issue can’t be its own sub-issue.',
  },
  DD001: {
    code: 'STATUS_LOCKED',
    message: 'In Review and Done are set by GitHub on this issue: open a pull request, then merge it. A project lead can override.',
  },
} as const

// ---------------------------------------------------------------- projects

type Project = { id: string; name: string; key: string }

/** Workspaces in the group the caller can see that have Issues switched on. */
async function loadProjects(context: AiExecutionContext): Promise<AiToolResult<Project[]>> {
  const { data, error } = await context.db
    .from('workspaces')
    .select('id, title, issue_key, workspace_modules(module)')
    .eq('team_id', context.teamId)
    .order('title')
  if (error) return dbFailure('load projects', error)
  const rows = data as unknown as { id: string; title: string; issue_key: string; workspace_modules: { module: string }[] }[]
  return ok(rows.filter((w) => w.workspace_modules.some((m) => m.module === 'issues')).map((w) => ({ id: w.id, name: w.title, key: w.issue_key })))
}

const projectList = (projects: Project[]) => projects.slice(0, 12).map((p) => ({ key: p.key, name: p.name }))

/** A project named by key or name. With no name: the open workspace, else the only project. Never a guess. */
function pickProject(projects: Project[], named: string | undefined, context: AiExecutionContext): AiToolResult<Project> {
  if (projects.length === 0) return fail('NOT_FOUND', 'There is no project with issues that you can open in this group.')
  if (named) {
    const byKey = projects.filter((p) => fold(p.key) === fold(named))
    const found = byKey.length > 0 ? byKey : bestMatches(projects, named, (p) => p.name)
    if (found.length === 1) return ok(found[0])
    return found.length === 0
      ? fail('NOT_FOUND', `No project matches "${named}".`, { projects: projectList(projects) })
      : fail('AMBIGUOUS', `Several projects match "${named}". Ask which one.`, { projects: projectList(found) })
  }
  const open = projects.find((p) => p.id === context.workspaceId)
  if (open) return ok(open)
  if (projects.length === 1) return ok(projects[0])
  return fail('NEEDS_CLARIFICATION', 'Ask the user which project this is for.', { projects: projectList(projects) })
}

// ------------------------------------------------------------------ issues

const IDENTIFIER = /^([A-Za-z][A-Za-z0-9]{0,9})-(\d{1,7})$/

const ISSUE_COLUMNS =
  'id, workspace_id, number, title, status, priority, assignee_id, cycle_id, repo_id, estimate, due_date, updated_at, ' +
  'assignee:profiles!issues_assignee_id_fkey(display_name), workspace:workspaces!issues_workspace_team_fkey(id, title, issue_key)'

type IssueRow = {
  id: string
  workspace_id: string
  number: number
  title: string
  status: IssueStatus
  priority: number
  assignee_id: string | null
  cycle_id: string | null
  repo_id: string | null
  estimate: number | null
  due_date: string | null
  updated_at: string
  assignee: { display_name: string | null } | null
  workspace: { id: string; title: string; issue_key: string }
}

/** What the model needs to talk about an issue; ids stay on the server. */
const summary = (row: IssueRow) => ({
  identifier: `${row.workspace.issue_key}-${row.number}`,
  title: row.title,
  status: STATUS_LABELS[row.status],
  priority: priorityName(row.priority),
  assignee: row.assignee_id ? (row.assignee?.display_name ?? 'Unnamed member') : null,
  dueDate: row.due_date,
  project: row.workspace.title,
})

/** The issue behind "CAP-12", if the caller can see it. */
async function loadIssue(context: AiExecutionContext, identifier: string): Promise<AiToolResult<IssueRow>> {
  const match = IDENTIFIER.exec(identifier.trim())
  if (!match) return fail('INVALID_ARGUMENTS', 'An issue is identified like CAP-12. Use search_issues to find it by title.')
  const projects = await loadProjects(context)
  if (!projects.success) return projects
  const project = projects.data.filter((p) => fold(p.key) === fold(match[1]))
  const missing = fail('NOT_FOUND', `There is no issue ${identifier.toUpperCase()}, or you can’t open it.`)
  if (project.length === 0) return missing
  const { data, error } = await context.db
    .from('issues')
    .select(ISSUE_COLUMNS)
    .in('workspace_id', project.map((p) => p.id))
    .eq('number', Number(match[2]))
    .limit(2)
  if (error) return dbFailure('load the issue', error)
  const rows = data as unknown as IssueRow[]
  if (rows.length === 0) return missing
  if (rows.length > 1) return fail('AMBIGUOUS', 'Two projects use that key. Ask which project is meant.')
  return ok(rows[0])
}

async function loadLabels(context: AiExecutionContext, workspaceId: string) {
  const { data, error } = await context.db.from('issue_labels').select('id, name').eq('workspace_id', workspaceId).order('name')
  return error ? dbFailure('load labels', error) : ok(data as { id: string; name: string }[])
}

/** Label names → ids. Labels are never created here: managing them belongs to leads. */
function pickLabels(available: { id: string; name: string }[], names: string[]): AiToolResult<string[]> {
  const ids: string[] = []
  for (const name of names) {
    const found = bestMatches(available, name, (l) => l.name)
    if (found.length !== 1) {
      return fail(found.length === 0 ? 'NOT_FOUND' : 'AMBIGUOUS', `No single label matches "${name}".`, { labels: available.map((l) => l.name).slice(0, 30) })
    }
    ids.push(found[0].id)
  }
  return ok([...new Set(ids)])
}

/**
 * The UI creates an issue's GitHub branch when it moves into In Progress and
 * the project has linked repos (useUpdateIssue → useCreateIssueBranch); the
 * database doesn't. Same call here, as the caller. A failure is reported
 * beside the change, never instead of it.
 */
async function startBranch(context: AiExecutionContext, issue: { id: string; workspace_id: string }) {
  const { count, error } = await context.db
    .from('workspace_repos')
    .select('repo_id', { count: 'exact', head: true })
    .eq('workspace_id', issue.workspace_id)
  if (error || !count) return undefined
  const result = await context.callFunction('github', { action: 'create_branch', issueId: issue.id })
  if (!result.success) return { branchNote: 'The issue moved, but its GitHub branch couldn’t be created. It can be created from the issue page.' }
  const { branch, created } = result.data as { branch?: { name?: string }; created?: boolean }
  return branch?.name ? { branch: branch.name, branchCreated: created === true } : undefined
}

async function resolveAssignee(context: AiExecutionContext, value: string): Promise<AiToolResult<string | null>> {
  if (fold(value) === 'none') return ok(null)
  if (fold(value) === 'me') return ok(context.userId)
  if (!isUuid(value)) return fail('INVALID_ARGUMENTS', 'assignee must be a person id from find_user, "me" or "none".')
  return ok(value)
}

const STATUS_PROPERTY = { type: 'string', enum: ISSUE_STATUSES } as const
const PRIORITY_PROPERTY = { type: 'string', enum: PRIORITY_NAMES } as const

type SearchArgs = {
  query?: string
  project?: string
  assigneeId?: string
  assignedToMe?: boolean
  unassigned?: boolean
  state?: 'open' | 'closed' | 'any'
  status?: IssueStatus[]
  priority?: PriorityName[]
  dueBefore?: string
  dueAfter?: string
  limit?: number
}

type CreateArgs = {
  title: string
  project?: string
  description?: string
  status?: IssueStatus
  priority?: PriorityName
  assignee?: string
  dueDate?: string
  labels?: string[]
}

type UpdateArgs = {
  issue: string
  title?: string
  status?: IssueStatus
  priority?: PriorityName
  assignee?: string
  dueDate?: string
  addLabels?: string[]
  removeLabels?: string[]
  sprint?: string
  repo?: string
  estimateHours?: number
}

export const issueTools = [
  defineTool<SearchArgs>({
    name: 'search_issues',
    description:
      'Search the issues the user can see in the current group. All filters are optional and combine. ' +
      'Use assignedToMe for "my issues", state "open" for open or active issues, and query for words from the title. ' +
      'Returns a short list (identifier like CAP-12, title, status, priority, assignee, due date, project) and the total number of matches.',
    domain: 'issues',
    capability: 'search',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words from the title, e.g. "login".', maxLength: 100 },
        project: { type: 'string', description: 'A project’s name or key (the CAP in CAP-12).', maxLength: 80 },
        assigneeId: { type: 'string', format: 'uuid', description: 'A person id from find_user.' },
        assignedToMe: { type: 'boolean', description: 'Only issues assigned to the user.' },
        unassigned: { type: 'boolean', description: 'Only issues with no assignee.' },
        state: { type: 'string', enum: ['open', 'closed', 'any'], description: 'open = not Done or Canceled. Default any.' },
        status: { type: 'array', items: STATUS_PROPERTY, maxItems: 6, description: 'Exact statuses, when the user names them.' },
        priority: { type: 'array', items: PRIORITY_PROPERTY, maxItems: 5 },
        dueBefore: { type: 'string', format: 'date', description: 'Due on or before this date (YYYY-MM-DD).' },
        dueAfter: { type: 'string', format: 'date', description: 'Due on or after this date (YYYY-MM-DD).' },
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Default 15.' },
      },
    },
    async execute(args, context) {
      // "CAP-12" typed as a search is a lookup.
      if (args.query && IDENTIFIER.test(args.query)) {
        const issue = await loadIssue(context, args.query)
        if (issue.success) return ok({ total: 1, issues: [summary(issue.data)] })
        if (issue.code === 'NOT_FOUND') return ok({ total: 0, issues: [] })
        return issue
      }

      let query = context.db.from('issues').select(ISSUE_COLUMNS, { count: 'exact' }).eq('team_id', context.teamId)
      if (args.project) {
        const projects = await loadProjects(context)
        if (!projects.success) return projects
        const project = pickProject(projects.data, args.project, context)
        if (!project.success) return project
        query = query.eq('workspace_id', project.data.id)
      }
      if (args.query) query = query.ilike('title', likePattern(args.query))
      if (args.assignedToMe) query = query.eq('assignee_id', context.userId)
      else if (args.assigneeId) query = query.eq('assignee_id', args.assigneeId)
      else if (args.unassigned) query = query.is('assignee_id', null)
      if (args.status?.length) query = query.in('status', args.status)
      else if (args.state === 'open') query = query.in('status', OPEN)
      else if (args.state === 'closed') query = query.in('status', CLOSED)
      if (args.priority?.length) query = query.in('priority', args.priority.map((p) => PRIORITIES[p]))
      if (args.dueBefore) query = query.lte('due_date', args.dueBefore)
      if (args.dueAfter) query = query.gte('due_date', args.dueAfter)

      const { data, error, count } = await query.order('updated_at', { ascending: false }).limit(args.limit ?? 15)
      if (error) return dbFailure('search issues', error)
      const rows = data as unknown as IssueRow[]
      const total = count ?? rows.length
      return ok({
        total,
        issues: rows.map(summary),
        ...(total > rows.length ? { note: `Showing the ${rows.length} most recently updated of ${total}. Add a filter to narrow down.` } : {}),
      })
    },
  }),

  defineTool<{ issue: string }>({
    name: 'get_issue',
    description: 'Get one issue by its identifier (e.g. CAP-12): title, status, priority, assignee, due date, project, labels, sprint, repository, estimate and the start of its description.',
    domain: 'issues',
    capability: 'get',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { issue: { type: 'string', description: 'The identifier, e.g. CAP-12.', maxLength: 20 } },
      required: ['issue'],
    },
    async execute({ issue }, context) {
      const found = await loadIssue(context, issue)
      if (!found.success) return found
      const row = found.data
      const [description, labels, cycle, repo] = await Promise.all([
        context.db.from('issues').select('description').eq('id', row.id).maybeSingle(),
        context.db.from('issue_label_links').select('label:issue_labels(name)').eq('issue_id', row.id),
        row.cycle_id ? context.db.from('issue_cycles').select('number, name, starts_on, ends_on').eq('id', row.cycle_id).maybeSingle() : null,
        row.repo_id ? context.db.from('repos').select('owner, name').eq('id', row.repo_id).maybeSingle() : null,
      ])
      const labelRows = (labels.data ?? []) as unknown as { label: { name: string } | null }[]
      const sprint = cycle?.data as { number: number; name: string | null; starts_on: string; ends_on: string } | null | undefined
      const repository = repo?.data as { owner: string; name: string } | null | undefined
      return ok({
        ...summary(row),
        labels: labelRows.flatMap((l) => (l.label ? [l.label.name] : [])),
        sprint: sprint ? { number: sprint.number, name: sprint.name, startsOn: sprint.starts_on, endsOn: sprint.ends_on } : null,
        repository: repository ? `${repository.owner}/${repository.name}` : null,
        estimateHours: row.estimate,
        description: docToText((description.data as { description: unknown } | null)?.description, 1000) || null,
      })
    },
  }),

  defineTool<CreateArgs>({
    name: 'create_issue',
    description:
      'Create an issue. Only the title is required. Leave project out when the user didn’t name one: the open project is used, ' +
      'and if that isn’t clear the tool answers with the projects to ask about. Never invent a project.',
    domain: 'issues',
    capability: 'create',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 200 },
        project: { type: 'string', description: 'A project’s name or key, only if the user named one.', maxLength: 80 },
        description: { type: 'string', description: 'Plain text.', maxLength: 4000 },
        status: { ...STATUS_PROPERTY, description: 'Default todo.' },
        priority: PRIORITY_PROPERTY,
        assignee: { type: 'string', description: 'A person id from find_user, or "me".', maxLength: 40 },
        dueDate: { type: 'string', format: 'date', description: 'YYYY-MM-DD.' },
        labels: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 10, description: 'Names of existing labels.' },
      },
      required: ['title'],
    },
    async execute(args, context) {
      const projects = await loadProjects(context)
      if (!projects.success) return projects
      const project = pickProject(projects.data, args.project, context)
      if (!project.success) return project

      let assigneeId: string | null = null
      if (args.assignee) {
        const assignee = await resolveAssignee(context, args.assignee)
        if (!assignee.success) return assignee
        assigneeId = assignee.data
      }
      let labelIds: string[] = []
      if (args.labels?.length) {
        const available = await loadLabels(context, project.data.id)
        if (!available.success) return available
        const picked = pickLabels(available.data, args.labels)
        if (!picked.success) return picked
        labelIds = picked.data
      }

      // number, team_id and created_by are set by the database (as in createIssue).
      const { data, error } = await context.db
        .from('issues')
        .insert({
          workspace_id: project.data.id,
          title: args.title,
          description: args.description ? textToDoc(args.description) : null,
          status: args.status ?? 'todo',
          priority: PRIORITIES[args.priority ?? 'none'],
          assignee_id: assigneeId,
          due_date: args.dueDate ?? null,
        })
        .select('id, number')
        .single()
      if (error) return dbFailure('create the issue', error, WRITE_ERRORS)
      const created = data as { id: string; number: number }

      let labelNote: string | undefined
      if (labelIds.length > 0) {
        const { error: labelError } = await context.db.rpc('set_issue_labels', { p_issue_id: created.id, p_label_ids: labelIds })
        if (labelError) labelNote = 'The issue was created, but its labels couldn’t be set.'
      }
      const branch = args.status === 'in_progress' ? await startBranch(context, { id: created.id, workspace_id: project.data.id }) : undefined
      return ok({
        identifier: `${project.data.key}-${created.number}`,
        title: args.title,
        project: project.data.name,
        ...(labelNote ? { labelNote } : {}),
        ...branch,
      })
    },
  }),

  defineTool<UpdateArgs>({
    name: 'update_issue',
    description:
      'Change an existing issue: title, status, priority, assignee, due date, labels, sprint, repository or estimate. ' +
      'Pass only what should change. If the tool refuses, tell the user why; do not retry with other values.',
    domain: 'issues',
    capability: 'update',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: {
        issue: { type: 'string', description: 'The identifier, e.g. CAP-12.', maxLength: 20 },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        status: STATUS_PROPERTY,
        priority: PRIORITY_PROPERTY,
        assignee: { type: 'string', description: 'A person id from find_user, "me", or "none" to unassign.', maxLength: 40 },
        dueDate: { type: 'string', description: 'YYYY-MM-DD, or "none" to clear it.', maxLength: 10 },
        addLabels: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 10, description: 'Names of existing labels to add.' },
        removeLabels: { type: 'array', items: { type: 'string', maxLength: 60 }, maxItems: 10 },
        sprint: { type: 'string', description: '"current", "next", a sprint number, or "none".', maxLength: 10 },
        repo: { type: 'string', description: 'A repository linked to the project (owner/name or name), or "none".', maxLength: 140 },
        estimateHours: { type: 'integer', minimum: 0, maximum: 1000, description: '0 clears the estimate.' },
      },
      required: ['issue'],
    },
    async execute(args, context) {
      const found = await loadIssue(context, args.issue)
      if (!found.success) return found
      const issue = found.data
      const patch: Record<string, unknown> = {}

      if (args.title !== undefined) patch.title = args.title
      if (args.status !== undefined) patch.status = args.status
      if (args.priority !== undefined) patch.priority = PRIORITIES[args.priority]
      if (args.estimateHours !== undefined) patch.estimate = args.estimateHours || null
      if (args.assignee !== undefined) {
        const assignee = await resolveAssignee(context, args.assignee)
        if (!assignee.success) return assignee
        patch.assignee_id = assignee.data
      }
      if (args.dueDate !== undefined) {
        if (fold(args.dueDate) === 'none') patch.due_date = null
        else if (isDate(args.dueDate)) patch.due_date = args.dueDate
        else return fail('INVALID_ARGUMENTS', 'dueDate must be YYYY-MM-DD or "none".')
      }
      if (args.sprint !== undefined) {
        if (fold(args.sprint) === 'none') patch.cycle_id = null
        else {
          const { data, error } = await context.db.from('issue_cycles').select('id, number, starts_on, ends_on').eq('workspace_id', issue.workspace_id).order('starts_on')
          if (error) return dbFailure('load sprints', error)
          const cycles = data as { id: string; number: number; starts_on: string; ends_on: string }[]
          const today = localDate(new Date(context.currentTime), context.timeZone)
          const wanted = fold(args.sprint)
          const cycle =
            wanted === 'current'
              ? cycles.find((c) => c.starts_on <= today && today <= c.ends_on)
              : wanted === 'next'
                ? cycles.find((c) => c.starts_on > today)
                : cycles.find((c) => String(c.number) === wanted.replace(/^sprint\s*/, ''))
          if (!cycle) return fail('NOT_FOUND', `There is no ${wanted === 'current' || wanted === 'next' ? `${wanted} sprint` : `sprint ${args.sprint}`} in this project.`, { sprints: cycles.map((c) => c.number) })
          patch.cycle_id = cycle.id
        }
      }
      if (args.repo !== undefined) {
        if (fold(args.repo) === 'none') patch.repo_id = null
        else {
          const { data, error } = await context.db.from('workspace_repos').select('repo:repos(id, owner, name)').eq('workspace_id', issue.workspace_id)
          if (error) return dbFailure('load repositories', error)
          const repos = (data as unknown as { repo: { id: string; owner: string; name: string } | null }[]).flatMap((r) => (r.repo ? [r.repo] : []))
          const wanted = fold(args.repo)
          const match = repos.filter((r) => fold(`${r.owner}/${r.name}`) === wanted || fold(r.name) === wanted)
          if (match.length !== 1) return fail(match.length ? 'AMBIGUOUS' : 'NOT_FOUND', `No single linked repository matches "${args.repo}".`, { repositories: repos.map((r) => `${r.owner}/${r.name}`) })
          patch.repo_id = match[0].id
        }
      }

      let labelIds: string[] | undefined
      if (args.addLabels?.length || args.removeLabels?.length) {
        const [available, current] = await Promise.all([
          loadLabels(context, issue.workspace_id),
          context.db.from('issue_label_links').select('label_id').eq('issue_id', issue.id),
        ])
        if (!available.success) return available
        if (current.error) return dbFailure('load the issue’s labels', current.error)
        const add = pickLabels(available.data, args.addLabels ?? [])
        if (!add.success) return add
        const remove = pickLabels(available.data, args.removeLabels ?? [])
        if (!remove.success) return remove
        const now = (current.data as { label_id: string }[]).map((l) => l.label_id)
        labelIds = [...new Set([...now, ...add.data])].filter((id) => !remove.data.includes(id))
      }

      const changed = Object.keys(patch)
      if (changed.length === 0 && !labelIds) return fail('INVALID_ARGUMENTS', 'Say what to change on the issue.')

      if (changed.length > 0) {
        const { data, error } = await context.db.from('issues').update(patch).eq('id', issue.id).select('id')
        if (error) return dbFailure('save the issue', error, WRITE_ERRORS)
        if (!data || data.length === 0) return DENIED
      }
      if (labelIds) {
        const { error } = await context.db.rpc('set_issue_labels', { p_issue_id: issue.id, p_label_ids: labelIds })
        if (error) return dbFailure('save the labels', error, WRITE_ERRORS)
      }
      const branch = patch.status === 'in_progress' && issue.status !== 'in_progress' ? await startBranch(context, issue) : undefined

      // Read it back: the answer describes what the database now holds, not what was asked for.
      const after = await loadIssue(context, args.issue)
      return ok({ ...(after.success ? summary(after.data) : { identifier: args.issue.toUpperCase() }), updated: true, ...branch })
    },
  }),
]
