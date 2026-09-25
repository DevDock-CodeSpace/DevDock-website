import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { workspaceLiveSessionsQuery } from '@/features/live/api'
import { LiveSessionList } from '@/features/live/components/LiveSessionList'
import { ScheduleSessionDialog } from '@/features/live/components/ScheduleSessionDialog'
import { useCalendarQueue, useNow } from '@/features/live/hooks'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { livePath, liveSessionPath } from '@/features/teams/nav'

/** Workspace → Live: only this workspace's sessions (WorkspaceToolGate checks the tool is on). */
export function WorkspaceLivePage() {
  useCalendarQueue()
  const { team } = useCurrentTeam()
  const { workspace, can } = useCurrentWorkspace()
  const sessions = useSuspenseQuery(workspaceLiveSessionsQuery(workspace.id)).data
  const now = useNow()

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link
          to={livePath(team.slug)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          All group sessions <ArrowRight className="size-3" />
        </Link>
        <ScheduleSessionDialog workspaceId={workspace.id} />
      </div>
      <LiveSessionList
        sessions={sessions}
        now={now}
        href={(session) => liveSessionPath(team.slug, session.id, workspace.id)}
        empty={
          can.canEdit
            ? 'No sessions in this workspace yet. Schedule the first one.'
            : 'No sessions in this workspace yet. The workspace lead schedules them.'
        }
      />
    </>
  )
}
