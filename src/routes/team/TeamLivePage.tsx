import { useMemo } from 'react'
import { PageHeader } from '@/components/PageHeader'
import type { MeetingsScope } from '@/features/live/api'
import { MeetingsView } from '@/features/live/components/MeetingsView'
import { useCalendarQueue, useNow } from '@/features/live/hooks'
import { useCollectionView } from '@/features/collections/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { liveSessionPath } from '@/features/teams/nav'

/** Group → Meetings: group-wide meetings plus meetings from every workspace the user can see (RLS). */
export function TeamLivePage() {
  useCalendarQueue()
  const { team, can } = useCurrentTeam()
  const { collection, workspaces } = useCollectionView()
  // A collection in view narrows the list on the server (group-wide meetings always show).
  const workspaceIds = collection ? workspaces.map((w) => w.id).sort().join(',') : null
  const scope = useMemo<MeetingsScope>(
    () => ({ kind: 'team', teamId: team.id, workspaceIds: workspaceIds === null ? null : workspaceIds ? workspaceIds.split(',') : [] }),
    [team.id, workspaceIds],
  )
  const now = useNow()

  return (
    <>
      <PageHeader
        title="Meetings"
        description={`Video meetings in ${team.name}: for the whole group, and for the workspaces you can access${collection ? ` in ${collection.name}` : ''}.`}
      />
      <MeetingsView
        scope={scope}
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
