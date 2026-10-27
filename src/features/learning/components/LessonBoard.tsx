import { useQuery } from '@tanstack/react-query'
import { Presentation } from 'lucide-react'
import { DockSpinner } from '@/components/DockSpinner'
import { Button } from '@/components/ui/button'
import { diagramQuery } from '@/features/diagrams/api'
import DiagramView from '@/features/diagrams/components/DiagramView'

type Props = {
  /** The whiteboard to show; null when the lesson's hasn't been started. */
  diagramId: string | null
  /** Teachers (the course's managers) draw; everyone else watches. */
  canManage: boolean
  /** Starts the lesson's whiteboard (its own tab only). */
  onStart?: () => void
  starting?: boolean
}

/**
 * A whiteboard on the lesson page (lazy: it brings React Flow): the lesson's own Whiteboard tab, or
 * another whiteboard in its folder. It's an ordinary whiteboard in the lesson's folder in Files, so
 * saving, the one-editor lock and live updates are the whiteboard page's own. Teachers start the
 * lesson's whiteboard; students see it read-only.
 */
export default function LessonBoard({ diagramId, canManage, onStart, starting }: Props) {
  const diagram = useQuery({ ...diagramQuery(diagramId ?? ''), enabled: diagramId !== null })

  if (diagramId === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Presentation className="size-8 text-muted-foreground" />
        {canManage && onStart ? (
          <>
            <p className="max-w-sm text-sm text-muted-foreground">Draw, write and add shapes or tables while you teach. Students see it here, read-only.</p>
            <Button onClick={onStart} disabled={starting}>
              {starting ? 'Starting…' : 'Start the whiteboard'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This lesson doesn’t have a whiteboard yet.</p>
        )}
      </div>
    )
  }
  if (diagram.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <DockSpinner label="Loading the whiteboard" />
      </div>
    )
  }
  if (diagram.isError || !diagram.data) {
    return (
      <div role="alert" className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {diagram.isError ? 'Couldn’t load the whiteboard.' : 'This whiteboard was deleted.'}
        {diagram.isError && (
          <Button variant="link" size="sm" onClick={() => void diagram.refetch()}>
            Try again
          </Button>
        )}
      </div>
    )
  }
  // Teachers draw (the database holds everyone else to viewing inside a lesson's folder).
  const canWrite = canManage && diagram.data.access_level >= 2
  return <DiagramView key={diagram.data.id} diagram={diagram.data} canWrite={canWrite} embedded />
}
