import { CircleUserRound } from 'lucide-react'
import type { DragEvent } from 'react'
import { Link } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuePath } from '@/features/teams/nav'
import { cn } from '@/lib/utils'
import type { Issue } from '../api'
import { useIssueContext, useUpdateIssue } from '../hooks'
import { isClosed, issueIdentifier, priorityLabel, statusLabel } from '../meta'
import { useRowNav } from '../nav-context'
import { AssigneePicker } from './AssigneePicker'
import { HiddenRowMenus } from './HiddenRowMenus'
import { LabelChip } from './LabelChip'
import { PriorityIcon } from './PriorityIcon'
import { PriorityPicker } from './PriorityPicker'
import { StatusIcon } from './StatusIcon'
import { StatusPicker } from './StatusPicker'

const iconButton =
  'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none'

/** A board card: ID + assignee, status + title, then priority and labels. Draggable between columns. */
export function IssueCard({
  issue,
  subIssues,
  onDragStart,
}: {
  issue: Issue
  subIssues?: { done: number; total: number }
  onDragStart: (event: DragEvent) => void
}) {
  const { team } = useCurrentTeam()
  const { workspace, members, labels, userId } = useIssueContext()
  const update = useUpdateIssue()
  const nav = useRowNav(issue.id)
  const assignee = members.find((m) => m.user_id === issue.assignee_id)
  const issueLabels = labels.filter((l) => issue.labelIds.includes(l.id))

  return (
    <li
      draggable
      onDragStart={onDragStart}
      data-issue-row={issue.id}
      onMouseEnter={nav.focus}
      className={cn(
        'group relative cursor-grab rounded-md border bg-card p-2.5 shadow-xs transition-colors hover:border-foreground/20 active:cursor-grabbing has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand',
        nav.active && 'border-brand/60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {issueIdentifier(workspace.issue_key, issue.number)}
        </span>
        <AssigneePicker
          value={issue.assignee_id}
          members={members}
          userId={userId}
          align="end"
          onChange={(assignee_id) => update.mutate({ issue, patch: { assignee_id } })}
          {...nav.menuFor('assignee')}
        >
          <button type="button" className={iconButton} aria-label="Assignee">
            {assignee ? (
              <PersonAvatar profile={assignee.profile} className="size-5" />
            ) : (
              <CircleUserRound className="size-4 text-muted-foreground/70" />
            )}
          </button>
        </AssigneePicker>
      </div>
      <div className="mt-1 flex items-start gap-1.5">
        <StatusPicker
          value={issue.status}
          onChange={(status) => update.mutate({ issue, patch: { status } })}
          {...nav.menuFor('status')}
        >
          <button type="button" className={cn(iconButton, '-ml-1 size-5')} aria-label={`Status: ${statusLabel[issue.status]}`}>
            <StatusIcon status={issue.status} />
          </button>
        </StatusPicker>
        <Link
          to={issuePath(team.slug, workspace.id, issue.number)}
          draggable={false}
          className={cn(
            'line-clamp-2 text-sm font-medium outline-none after:absolute after:inset-0',
            isClosed(issue.status) && 'text-muted-foreground',
          )}
        >
          {issue.title}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <PriorityPicker
          value={issue.priority}
          onChange={(priority) => update.mutate({ issue, patch: { priority } })}
          {...nav.menuFor('priority')}
        >
          <button
            type="button"
            className={cn(iconButton, 'size-5 rounded-sm border')}
            aria-label={`Priority: ${priorityLabel[issue.priority]}`}
          >
            <PriorityIcon priority={issue.priority} className="size-3" />
          </button>
        </PriorityPicker>
        {subIssues && subIssues.total > 0 && (
          <span className="rounded-full border px-1.5 font-mono text-[10px] text-muted-foreground">
            {subIssues.done}/{subIssues.total}
          </span>
        )}
        {issueLabels.map((l) => (
          <LabelChip key={l.id} label={l} />
        ))}
      </div>
      <HiddenRowMenus issue={issue} className="absolute bottom-0 left-2" />
    </li>
  )
}
