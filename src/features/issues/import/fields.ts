// What an imported column can become, where a file came from, and the first guess at which
// column is which. Linear, Notion and Jira are presets on the same importer: each writes a CSV
// with its own header names, and the guess knows them. Everything stays editable on the page.
// No imports: Deno tests run it as is (npm run test:import).

export type ImportSource = 'csv' | 'linear' | 'notion' | 'jira'

export type ImportField =
  | 'title'
  | 'description'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'labels'
  | 'project'
  | 'milestone'
  | 'estimate'
  | 'due_date'
  | 'sprint'
  | 'ref'
  | 'parent'

/** A column index per field; null = not imported. */
export type ColumnMapping = Record<ImportField, number | null>

export const FIELDS: { field: ImportField; label: string; hint: string }[] = [
  { field: 'title', label: 'Title', hint: 'Required. Rows without one are left out.' },
  { field: 'description', label: 'Description', hint: 'Markdown becomes formatted text.' },
  { field: 'status', label: 'Status', hint: 'Each value is matched to a Calsko status below.' },
  { field: 'priority', label: 'Priority', hint: 'Urgent, High, Medium, Low, or a number.' },
  { field: 'assignee', label: 'Assignee', hint: 'Matched to people in this project by name. Anyone else keeps the name from the file until you match them.' },
  { field: 'labels', label: 'Labels', hint: 'Separated by commas. Missing labels are created.' },
  { field: 'project', label: 'Plan', hint: 'Linear’s project. Becomes a plan (one with the same name is reused).' },
  { field: 'milestone', label: 'Milestone', hint: 'Becomes a label.' },
  { field: 'estimate', label: 'Estimate', hint: 'A number from 0 to 100.' },
  { field: 'due_date', label: 'Due date', hint: 'Most date formats.' },
  { field: 'sprint', label: 'Sprint', hint: 'Matched to this project’s sprints by number or name, or created from the file’s dates.' },
  { field: 'ref', label: 'ID', hint: 'The issue’s id in the file. Importing the file again skips issues already imported.' },
  { field: 'parent', label: 'Parent', hint: 'The parent issue’s ID, for sub-issues.' },
]

export const SOURCES: { source: ImportSource; label: string; how: string }[] = [
  { source: 'csv', label: 'CSV file', how: 'Any spreadsheet saved as CSV, with a header row.' },
  { source: 'linear', label: 'Linear', how: 'In Linear: Settings → Import / Export → Export CSV.' },
  { source: 'notion', label: 'Notion', how: 'Open the database in Notion: ··· → Export → Markdown & CSV, then pick the .csv from the download.' },
  { source: 'jira', label: 'Jira', how: 'In Jira: Filters → search the issues → Export → Export CSV (all fields).' },
]

const norm = (header: string) => header.trim().toLowerCase().replace(/\s+/g, ' ')

/** Recognises an export from its headers; anything else is a plain CSV. */
export function detectSource(headers: string[]): ImportSource {
  const has = (name: string) => headers.some((h) => norm(h) === name)
  if (has('summary') && (has('issue key') || has('issue id'))) return 'jira'
  if (has('id') && has('title') && (has('cycle number') || has('parent issue') || has('team'))) return 'linear'
  return 'csv'
}

// Header names per field, best first. Linear and Jira names come first where they differ.
const NAMES: Record<ImportField, string[]> = {
  title: ['title', 'summary', 'name', 'task name', 'task', 'issue'],
  description: ['description', 'body', 'details', 'content', 'notes'],
  status: ['status', 'state', 'stage'],
  priority: ['priority'],
  assignee: ['assignee', 'assigned to', 'assign', 'owner', 'person', 'responsible', 'people'],
  labels: ['labels', 'label', 'tags', 'tag'],
  project: ['project'],
  milestone: ['project milestone', 'milestone'],
  estimate: ['estimate', 'story points', 'custom field (story points)', 'story point estimate', 'points', 'hours'],
  due_date: ['due date', 'due', 'deadline', 'due on', 'date'],
  sprint: ['cycle number', 'sprint', 'cycle', 'cycle name', 'iteration'],
  ref: ['id', 'issue key', 'key', 'identifier', 'issue id'],
  parent: ['parent issue', 'parent', 'parent key', 'parent id', 'parent item', 'sub-item of'],
}

/** For each field, the first header that matches one of its names; a column is used once. */
export function guessMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map(norm)
  const taken = new Set<number>()
  const mapping = {} as ColumnMapping
  for (const { field } of FIELDS) {
    mapping[field] = null
    for (const name of NAMES[field]) {
      const index = normalized.findIndex((h, i) => h === name && !taken.has(i))
      if (index >= 0) {
        mapping[field] = index
        taken.add(index)
        break
      }
    }
  }
  return mapping
}

/**
 * Columns whose values can name an issue: the ID column and any other id-like one (Jira's
 * Parent holds the parent's "Issue id", while its "Issue key" is the better ID to keep).
 */
export function idColumns(headers: string[], mapping: ColumnMapping): number[] {
  const ids = new Set(NAMES.ref)
  const columns = headers.flatMap((h, i) => (ids.has(norm(h)) ? [i] : []))
  return mapping.ref === null ? columns : [mapping.ref, ...columns.filter((i) => i !== mapping.ref)]
}

/**
 * Jira repeats a header once per value (Labels, Labels, Labels; Sprint, Sprint). A field reads
 * its column and every other column with the same header.
 */
export function sameNamedColumns(headers: string[], column: number): number[] {
  const name = norm(headers[column] ?? '')
  return headers.flatMap((h, i) => (norm(h) === name ? [i] : []))
}
