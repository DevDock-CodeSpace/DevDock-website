import { CircleUserRound, GitBranch, Gauge, IterationCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuePath } from '@/features/teams/nav'
import { formatShortDate, localDateISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Issue } from '../api'
import { cycleTitle } from '../cycles'
import { useIssueContext, useUpdateIssue } from '../hooks'
import { ESTIMATE_HOURS, hoursLabel, isClosed, issueIdentifier, priorityLabel, statusLabel } from '../meta'
import { useRowNav } from '../nav-context'
import { AssigneePicker } from './AssigneePicker'
import { CyclePicker } from './CyclePicker'
import { DueDatePicker } from './DueDatePicker'
import { HiddenRowMenus } from './HiddenRowMenus'
import { LabelChip } from './LabelChip'
import { Picker } from './Picker'
import { PriorityIcon } from './PriorityIcon'
import { PriorityPicker } from './PriorityPicker'
import { RepoPicker } from './RepoPicker'
import { StatusIcon } from './StatusIcon'
import { StatusPicker } from './StatusPicker'

const iconButton =
  'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none'

/** A compact, clickable property chip that sits above the row's stretched title link. */
const chip =
  'relative z-10 hidden shrink-0 items-center gap-1 rounded-sm px-1 font-mono text-[11px] text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none'
const NONE = 'none'

/**
 * One list row, like Linear's: priority · ID · status · title · sub-issue
 * progress … cycle · repo · labels · due date · assignee · created. The whole row opens the
 * issue (a stretched title link); priority, status and assignee are menus.
 * Hover or j/k focuses it for keyboard shortcuts.
 */
export function IssueRow({ issue, subIssues }: { issue: Issue; subIssues?: { done: number; total: number } }) {
  const { team } = useCurrentTeam()
  const { workspace, members, labels, cycles, repos, userId } = useIssueContext()
  const update = useUpdateIssue()
  const nav = useRowNav(issue.id)
  const cycle = cycles.find((c) => c.id === issue.cycle_id)
  const repo = repos.find((r) => r.id === issue.repo_id)
  const [today] = useState(() => localDateISO(new Date()))
  const assignee = members.find((m) => m.user_id === issue.assignee_id)
  const issueLabels = labels.filter((l) => issue.labelIds.includes(l.id))
  const id = issueIdentifier(workspace.issue_key, issue.number)

  return (
    <li
      data-issue-row={issue.id}
      onMouseEnter={nav.focus}
      className={cn(
        'group relative flex h-10 items-center gap-2 px-3 text-sm has-[a:focus-visible]:bg-muted/50',
        nav.active && 'bg-muted/60 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-brand',
      )}
    >
      <PriorityPicker
        value={issue.priority}
        onChange={(priority) => update.mutate({ issue, patch: { priority } })}
        {...nav.menuFor('priority')}
      >
        <button type="button" className={iconButton} aria-label={`Priority: ${priorityLabel[issue.priority]}`}>
          <PriorityIcon priority={issue.priority} />
        </button>
      </PriorityPicker>
      <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{id}</span>
      <StatusPicker
        value={issue.status}
        onChange={(status) => update.mutate({ issue, patch: { status } })}
        {...nav.menuFor('status')}
      >
        <button type="button" className={iconButton} aria-label={`Status: ${statusLabel[issue.status]}`}>
          <StatusIcon status={issue.status} />
        </button>
      </StatusPicker>
      <Link
        to={issuePath(team.slug, workspace.id, issue.number)}
        className={cn(
          'min-w-0 truncate font-medium outline-none after:absolute after:inset-0',
          isClosed(issue.status) && 'text-muted-foreground',
        )}
      >
        {issue.title}
      </Link>
      {subIssues && subIssues.total > 0 && (
        <span
          className="shrink-0 rounded-full border px-1.5 font-mono text-[10px] text-muted-foreground"
          title={`${subIssues.done} of ${subIssues.total} sub-issues done`}
        >
          {subIssues.done}/{subIssues.total}
        </span>
      )}
      <span className="flex-1" />
      {cycle && (
        <CyclePicker
          value={issue.cycle_id}
          cycles={cycles}
          align="end"
          onChange={(cycle_id) => update.mutate({ issue, patch: { cycle_id } })}
        >
          <button type="button" className={cn(chip, 'lg:flex')} title={cycleTitle(cycle)} aria-label={`Sprint: ${cycleTitle(cycle)}`}>
            <IterationCw className="size-3" />
            {cycle.number}
          </button>
        </CyclePicker>
      )}
      {repo && (
        <RepoPicker
          value={issue.repo_id}
          repos={repos}
          align="end"
          onChange={(repo_id) => update.mutate({ issue, patch: { repo_id } })}
        >
          <button
            type="button"
            className={cn(chip, 'max-w-32 lg:flex')}
            title={`Repository: ${repo.owner}/${repo.name}`}
            aria-label={`Repository: ${repo.name}`}
          >
            <GitBranch className="size-3 shrink-0" />
            <span className="truncate">{repo.name}</span>
          </button>
        </RepoPicker>
      )}
      <span className="hidden items-center gap-1 md:flex">
        {issueLabels.slice(0, 2).map((l) => (
          <LabelChip key={l.id} label={l} />
        ))}
        {issueLabels.length > 2 && (
          <span className="font-mono text-[11px] text-muted-foreground">+{issueLabels.length - 2}</span>
        )}
      </span>
      {issue.due_date && (
        <DueDatePicker value={issue.due_date} onChange={(due_date) => update.mutate({ issue, patch: { due_date } })}>
          {(open) => (
            <button
              type="button"
              onClick={open}
              aria-label={`Due date: ${formatShortDate(issue.due_date!)}`}
              className={cn(
                'relative z-10 hidden shrink-0 items-center rounded-sm border px-1.5 font-mono text-[11px] hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none sm:inline-flex',
                !isClosed(issue.status) && issue.due_date! < today
                  ? 'border-red-500/40 text-red-600 dark:text-red-400'
                  : 'text-muted-foreground',
              )}
            >
              {formatShortDate(issue.due_date!)}
            </button>
          )}
        </DueDatePicker>
      )}
      {issue.estimate !== null && (
        <Picker
          placeholder="Set estimate…"
          align="end"
          selected={[String(issue.estimate)]}
          onSelect={(v) => update.mutate({ issue, patch: { estimate: v === NONE ? null : Number(v) } })}
          options={[
            { value: NONE, label: 'No estimate' },
            ...ESTIMATE_HOURS.map((e) => ({ value: String(e), label: hoursLabel(e) })),
          ]}
        >
          <button type="button" className={cn(chip, 'sm:flex')} aria-label={`Estimate: ${hoursLabel(issue.estimate)}`}>
            <Gauge className="size-3" />
            {issue.estimate}h
          </button>
        </Picker>
      )}
      <AssigneePicker
        value={issue.assignee_id}
        members={members}
        userId={userId}
        align="end"
        onChange={(assignee_id) => update.mutate({ issue, patch: { assignee_id } })}
        {...nav.menuFor('assignee')}
      >
        <button
          type="button"
          className={iconButton}
          aria-label={assignee ? `Assignee: ${assignee.profile?.display_name ?? 'member'}` : 'Assign'}
        >
          {assignee ? (
            <PersonAvatar profile={assignee.profile} className="size-5" />
          ) : (
            <CircleUserRound className="size-4 text-muted-foreground/70" />
          )}
        </button>
      </AssigneePicker>
      <span className="hidden w-12 shrink-0 text-right font-mono text-[11px] text-muted-foreground sm:block">
        {formatShortDate(issue.created_at)}
      </span>
      <HiddenRowMenus issue={issue} className="absolute top-full right-24" />
    </li>
  )
}
