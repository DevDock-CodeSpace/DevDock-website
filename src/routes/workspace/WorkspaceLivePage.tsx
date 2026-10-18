import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import type { MeetingsScope } from '@/features/live/api'
import { MeetingsView } from '@/features/live/components/MeetingsView'
import { useCalendarQueue, useNow } from '@/features/live/hooks'
import { useCurrentTeam, useCurrentWorkspace } from '@/features/teams/hooks'
import { livePath, liveSessionPath } from '@/features/teams/nav'

/** Workspace → Meetings: only this workspace's meetings (WorkspaceToolGate checks the tool is on). */
export function WorkspaceLivePage() {
  useCalendarQueue()
  const { team } = useCurrentTeam()
  const { workspace, can } = useCurrentWorkspace()
  const scope = useMemo<MeetingsScope>(() => ({ kind: 'workspace', workspaceId: workspace.id }), [workspace.id])
  const now = useNow()

  return (
    <MeetingsView
      scope={scope}
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
