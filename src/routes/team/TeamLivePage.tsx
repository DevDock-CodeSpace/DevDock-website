import { useSuspenseQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { teamLiveSessionsQuery } from '@/features/live/api'
import { MeetingsView } from '@/features/live/components/MeetingsView'
import { useCalendarQueue, useNow } from '@/features/live/hooks'
import { useCollectionView } from '@/features/collections/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { liveSessionPath } from '@/features/teams/nav'

/** Group → Meetings: group-wide meetings plus meetings from every workspace the user can see (RLS). */
export function TeamLivePage() {
  useCalendarQueue()
  const { team, can } = useCurrentTeam()
  const { collection, inView } = useCollectionView()
  const sessions = useSuspenseQuery(teamLiveSessionsQuery(team.id)).data.filter((s) => inView(s.workspace_id))
  const now = useNow()

  return (
    <>
      <PageHeader
        title="Meetings"
        description={`Video meetings in ${team.name}: for the whole group, and for the workspaces you can access${collection ? ` in ${collection.name}` : ''}.`}
      />
      <MeetingsView
        sessions={sessions}
        now={now}
        showScope
        href={(session) => liveSessionPath(team.slug, session.id)}
        empty={
          can.isAdmin
            ? 'No meetings yet. Schedule one for the whole group, or for a workspace.'
            : 'No meetings yet. Group owners/admins and workspace leads schedule them.'
        }
      />
    </>
  )
}
