import type { Issue, IssuePriority, IssueStatus, LabelColor } from './api'

// Display metadata for issue fields, in Linear's order.

export const STATUS_ORDER: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']

export const statusLabel: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  canceled: 'Canceled',
}

export const isClosed = (status: IssueStatus) => status === 'done' || status === 'canceled'

/** Menu order, as in Linear: No priority first, then most to least urgent. */
export const PRIORITY_ORDER: IssuePriority[] = [0, 1, 2, 3, 4]

export const priorityLabel: Record<IssuePriority, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
}

export const LABEL_COLORS: LabelColor[] = ['default', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'violet']

/** The dot in front of a label. */
export const labelDotClass: Record<LabelColor, string> = {
  default: 'bg-muted-foreground',
  blue: 'bg-blue-500',
  teal: 'bg-teal-500',
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  pink: 'bg-pink-500',
  violet: 'bg-violet-500',
}

/** CAP-12 */
export const issueIdentifier = (key: string, number: number) => `${key}-${number}`

/** Linear's default order inside a group: urgent → low, then no priority; newest first. */
export function compareIssues(a: Issue, b: Issue) {
  const rank = (p: IssuePriority) => (p === 0 ? 5 : p)
  return rank(a.priority) - rank(b.priority) || b.number - a.number
}
