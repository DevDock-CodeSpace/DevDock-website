import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { workspaceLiveSessionsQuery } from '@/features/live/api'
import { MeetingsView } from '@/features/live/components/MeetingsView'
import { useCalendarQueue, useNow } from '@/features/live/hooks'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { livePath, liveSessionPath } from '@/features/teams/nav'

/** Workspace → Meetings: only this workspace's meetings (WorkspaceToolGate checks the tool is on). */
export function WorkspaceLivePage() {
  useCalendarQueue()
  const { team } = useCurrentTeam()
  const { workspace, can } = useCurrentWorkspace()
  const sessions = useSuspenseQuery(workspaceLiveSessionsQuery(workspace.id)).data
  const now = useNow()

  return (
    <MeetingsView
      sessions={sessions}
      now={now}
      workspaceId={workspace.id}
      href={(session) => liveSessionPath(team.slug, session.id, workspace.id)}
      lead={
        <Link
          to={livePath(team.slug)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          All group meetings <ArrowRight className="size-3" />
        </Link>
      }
      empty={
        can.canEdit
          ? 'No meetings in this workspace yet. Schedule the first one.'
          : 'No meetings in this workspace yet. The workspace lead schedules them.'
      }
    />
  )
}
