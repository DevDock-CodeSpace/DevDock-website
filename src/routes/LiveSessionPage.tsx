import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { liveSessionQuery } from '@/features/live/api'
import { LiveSessionView } from '@/features/live/components/LiveSessionView'

/**
 * One live session, at /t/:teamSlug/live/:sessionId (group view) or
 * …/w/:workspaceId/live/:sessionId. liveSessionLoader has already checked it
 * exists, belongs to this group, and (in a workspace) to that workspace.
 */
export function LiveSessionPage() {
  const { sessionId = '', workspaceId } = useParams()
  const session = useSuspenseQuery(liveSessionQuery(sessionId)).data

  if (!session) {
    return <p className="py-16 text-center text-sm text-muted-foreground">This session was cancelled.</p>
  }
  return <LiveSessionView key={session.id} session={session} workspaceId={workspaceId} />
}
