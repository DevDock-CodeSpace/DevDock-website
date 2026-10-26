import { CircleCheckBig } from 'lucide-react'
import { Link } from 'react-router'
import { issueIdentifier } from '@/features/issues/meta'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuePath, workspacePath } from '@/features/teams/nav'
import { cn } from '@/lib/utils'
import type { Reminder } from '../api'

/** What a note is about: its issue ("CAP-12") and workspace, as links. Nothing when it's about neither. */
export function NoteContext({ reminder, className }: { reminder: Reminder; className?: string }) {
  const { team } = useCurrentTeam()
  const { workspace, workspace_id: workspaceId, issue } = reminder
  if (!workspace || !workspaceId) return null
  return (
    <span className={cn('flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground', className)}>
      {issue && (
        <Link
          to={issuePath(team.slug, workspaceId, issue.number)}
          title={issue.title}
          className="relative z-10 inline-flex shrink-0 items-center gap-1 font-mono hover:text-foreground"
        >
          <CircleCheckBig className="size-3" /> {issueIdentifier(workspace.issue_key, issue.number)}
        </Link>
      )}
      <Link to={workspacePath(team.slug, workspaceId)} className="relative z-10 min-w-0 truncate hover:text-foreground">
        {workspace.title}
      </Link>
    </span>
  )
}
