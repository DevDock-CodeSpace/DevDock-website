// The file + the column mapping + the value choices → the rows import_issues() receives,
// parents before their sub-issues, and the sprints to create. Pure, so the page recomputes it
// on every change and the preview always shows exactly what will be sent. No imports from @/:
// Deno tests run it.

import type { CsvTable } from './csv.ts'
import { idColumns, sameNamedColumns, type ColumnMapping, type ImportField } from './fields.ts'
import { fileSprint, firstPerson, labelName, parseDate, parseEstimate, splitLabels, type FileSprint, type Priority, type Status } from './values.ts'

/** An assignee choice: keep the file's name on the issue until someone is matched to it. */
export const KEEP_NAME = 'keep'
/** A sprint choice: create the sprint the file describes. */
export const NEW_SPRINT = 'new'

/** What each distinct cell value becomes, keyed by the trimmed text. */
export type ValueChoices = {
  status: Record<string, Status>
  priority: Record<string, Priority>
  /** A person's id, KEEP_NAME, or null for nobody. */
  assignee: Record<string, string | null>
  /** A sprint's id, NEW_SPRINT, or null for none. */
  sprint: Record<string, string | null>
}

export type ImportRow = {
  ref: string
  title: string
  /** The cell's text; the page turns it into the editor's JSON when importing. */
  description: string | null
  status: Status
  priority: Priority
  assignee_id: string | null
  /** The file's name for an assignee nobody is matched to yet. */
  import_assignee: string | null
  labels: string[]
  estimate: number | null
  due_date: string | null
  cycle_id: string | null
  /** A sprint created by this import (FileSprint.ref). */
  cycle_ref: string | null
  /** The plan this issue goes in: the file's project name (ImportBatch.plans ref). */
  plan_ref: string | null
  parent_ref: string | null
}

export type ImportBatch = {
  rows: ImportRow[]
  /** Rows left out, by their line in the file (the header is line 1). */
  leftOut: { line: number; reason: string }[]
  /** Labels the import creates (not in the project yet), as first written. */
  newLabels: string[]
  /** Sprints the import creates, oldest first. */
  newSprints: FileSprint[]
  /** Names kept on issues until someone is matched to them. */
  keptPeople: string[]
  /** The file's projects (Linear's), each becoming a plan: ref = name as written. */
  plans: { ref: string; name: string }[]
  /** Those of them no plan in the group has the name of yet. */
  newPlans: string[]
  /** Sub-issues whose parent isn't in the file (they may match one imported before). */
  outsideParents: number
}

export type ChoiceField = keyof ValueChoices

/**
 * Reads one field of a row: labels from every same-named column (Jira repeats them), a sprint
 * from the last filled one (its latest).
 */
export function cellOf(table: CsvTable, mapping: ColumnMapping, row: string[], field: ImportField): string {
  const column = mapping[field]
  if (column === null) return ''
  if (field === 'labels') return sameNamedColumns(table.headers, column).map((i) => row[i] ?? '').filter((v) => v.trim()).join(', ')
  if (field === 'sprint') {
    const filled = sameNamedColumns(table.headers, column).map((i) => (row[i] ?? '').trim()).filter(Boolean)
    return filled.at(-1) ?? ''
  }
  return (row[column] ?? '').trim()
}

/** The values a choice field takes in the file, most common first, with how many rows have each. */
export function distinctValues(table: CsvTable, mapping: ColumnMapping, field: ChoiceField): { value: string; count: number }[] {
  if (mapping[field] === null) return []
  const counts = new Map<string, number>()
  for (const row of table.rows) {
    const cell = cellOf(table, mapping, row, field)
    const value = field === 'assignee' ? firstPerson(cell) : cell
    if (field !== 'priority' && field !== 'status' && !value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

const column = (table: CsvTable, names: string[]) => table.headers.findIndex((h) => names.includes(h.trim().toLowerCase()))

/** The sprints the file describes with dates (Linear's Cycle Name / Start / End), by sprint value. */
export function sprintsInFile(table: CsvTable, mapping: ColumnMapping): Map<string, FileSprint> {
  const sprints = new Map<string, FileSprint>()
  const name = column(table, ['cycle name', 'sprint name'])
  const start = column(table, ['cycle start', 'sprint start', 'sprint start date'])
  const end = column(table, ['cycle end', 'sprint end', 'sprint end date'])
  if (mapping.sprint === null || start < 0 || end < 0) return sprints
  for (const row of table.rows) {
    const value = cellOf(table, mapping, row, 'sprint')
    if (!value || sprints.has(value)) continue
    const sprint = fileSprint(value, name < 0 ? '' : (row[name] ?? ''), row[start] ?? '', row[end] ?? '')
    if (sprint) sprints.set(value, sprint)
  }
  return sprints
}

const titleKey = (title: string) => `title:${title.toLowerCase().replace(/\s+/g, ' ').slice(0, 180)}`

export function buildImport(
  table: CsvTable,
  mapping: ColumnMapping,
  choices: ValueChoices,
  existingLabels: string[],
  existingPlans: string[] = [],
): ImportBatch {
  const leftOut: ImportBatch['leftOut'] = []
  const rows: (ImportRow & { line: number; parentValue: string })[] = []
  const usedRefs = new Map<string, number>()
  // Any id-like value of a row → its index in `rows`, so Parent can use whichever id the file uses.
  const byId = new Map<string, number>()
  const ids = idColumns(table.headers, mapping)
  const fileSprints = sprintsInFile(table, mapping)
  const newSprints = new Map<string, FileSprint>()
  const keptPeople = new Set<string>()
  const plans = new Map<string, string>() // lower-case name → first spelling

  table.rows.forEach((row, index) => {
    const line = index + 2
    const title = cellOf(table, mapping, row, 'title')
    if (!title) {
      leftOut.push({ line, reason: 'No title' })
      return
    }
    // Without an ID column, the title stands in, so importing the same file again still skips it.
    const base = (cellOf(table, mapping, row, 'ref') || titleKey(title)).slice(0, 190)
    const seen = usedRefs.get(base) ?? 0
    usedRefs.set(base, seen + 1)
    const ref = seen === 0 ? base : `${base}#${seen + 1}`

    const status = cellOf(table, mapping, row, 'status')
    const priority = cellOf(table, mapping, row, 'priority')
    const assignee = firstPerson(cellOf(table, mapping, row, 'assignee'))
    const assigneeChoice = assignee ? (choices.assignee[assignee] ?? null) : null
    if (assigneeChoice === KEEP_NAME) keptPeople.add(assignee)
    const sprint = cellOf(table, mapping, row, 'sprint')
    const sprintChoice = sprint ? (choices.sprint[sprint] ?? null) : null
    const created = sprintChoice === NEW_SPRINT ? fileSprints.get(sprint) : undefined
    if (created) newSprints.set(sprint, created)
    const description = mapping.description === null ? '' : (row[mapping.description] ?? '').trim()
    // Linear's project is a plan (docs/ISSUES_HUB_PLAN.md); its milestone stays a label for now.
    const planName = cellOf(table, mapping, row, 'project').replace(/\s+/g, ' ').slice(0, 120).trim()
    if (planName) plans.set(planName.toLowerCase(), planName)
    const labels = [...splitLabels(cellOf(table, mapping, row, 'labels')), labelName(cellOf(table, mapping, row, 'milestone'))].filter(Boolean)

    for (const id of ids) {
      const value = (row[id] ?? '').trim()
      if (value && !byId.has(value)) byId.set(value, rows.length)
    }
    rows.push({
      line,
      ref,
      title: title.slice(0, 300),
      description: description || null,
      status: mapping.status === null ? 'todo' : (choices.status[status] ?? 'todo'),
      priority: mapping.priority === null ? 0 : (choices.priority[priority] ?? 0),
      assignee_id: assigneeChoice === KEEP_NAME ? null : assigneeChoice,
      import_assignee: assigneeChoice === KEEP_NAME ? assignee.slice(0, 200) : null,
      labels: [...new Map(labels.map((l) => [l.toLowerCase(), l])).values()],
      estimate: parseEstimate(cellOf(table, mapping, row, 'estimate')),
      due_date: parseDate(cellOf(table, mapping, row, 'due_date')),
      cycle_id: sprintChoice === NEW_SPRINT ? null : sprintChoice,
      cycle_ref: created ? created.ref : null,
      plan_ref: planName ? plans.get(planName.toLowerCase())! : null,
      parent_ref: null,
      parentValue: cellOf(table, mapping, row, 'parent'),
    })
  })

  // Parents first: a sub-issue is placed after its parent; a loop in the file loses its last link.
  let outsideParents = 0
  const parentOf = rows.map((r, i) => {
    if (!r.parentValue) return null
    const parent = byId.get(r.parentValue)
    if (parent === undefined) {
      // Not in this file: maybe imported before, which the database checks.
      r.parent_ref = r.parentValue
      outsideParents++
      return null
    }
    return parent === i ? null : parent
  })
  const ordered: ImportRow[] = []
  const state = new Array<0 | 1 | 2>(rows.length).fill(0) // 0 new, 1 visiting, 2 placed
  const place = (i: number) => {
    if (state[i] === 2) return
    state[i] = 1
    const parent = parentOf[i]
    if (parent !== null) {
      if (state[parent] === 1) parentOf[i] = null
      else place(parent)
    }
    const { line: _line, parentValue: _parent, ...row } = rows[i]
    row.parent_ref = parentOf[i] === null ? row.parent_ref : rows[parentOf[i]!].ref
    ordered.push(row)
    state[i] = 2
  }
  rows.forEach((_, i) => place(i))

  const known = new Set(existingLabels.map((l) => l.trim().toLowerCase()))
  const newLabels = new Map<string, string>()
  for (const row of ordered) for (const label of row.labels) if (!known.has(label.toLowerCase())) newLabels.set(label.toLowerCase(), label)

  return {
    rows: ordered,
    leftOut,
    newLabels: [...newLabels.values()],
    newSprints: [...newSprints.values()].sort((a, b) => a.starts_on.localeCompare(b.starts_on)),
    keptPeople: [...keptPeople],
    plans: [...plans.values()].map((name) => ({ ref: name, name })),
    newPlans: [...plans.values()].filter((name) => !existingPlans.some((p) => p.trim().toLowerCase() === name.toLowerCase())),
    outsideParents,
  }
}
