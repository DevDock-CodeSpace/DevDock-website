import { useSuspenseQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { teamLiveSessionsQuery } from '@/features/live/api'
import { LiveSessionList } from '@/features/live/components/LiveSessionList'
import { ScheduleSessionDialog } from '@/features/live/components/ScheduleSessionDialog'
import { useCalendarQueue, useNow } from '@/features/live/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { liveSessionPath } from '@/features/teams/nav'

/** Group → Live: group-wide sessions plus sessions from every workspace the user can see (RLS). */
export function TeamLivePage() {
  useCalendarQueue()
  const { team, can } = useCurrentTeam()
  const sessions = useSuspenseQuery(teamLiveSessionsQuery(team.id)).data
  const now = useNow()

  return (
    <>
      <PageHeader
        title="Live"
        description={`Video sessions in ${team.name}: for the whole group, and for the workspaces you can access.`}
      >
        <ScheduleSessionDialog />
      </PageHeader>
      <LiveSessionList
        sessions={sessions}
        now={now}
        showScope
        href={(session) => liveSessionPath(team.slug, session.id)}
        empty={
          can.isAdmin
            ? 'No sessions yet. Schedule one for the whole group, or for a workspace.'
            : 'No sessions yet. Group owners/admins and workspace leads schedule them.'
        }
      />
    </>
  )
}
