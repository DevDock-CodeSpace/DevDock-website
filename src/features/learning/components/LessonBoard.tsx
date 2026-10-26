import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Presentation } from 'lucide-react'
import { toast } from 'sonner'
import { DockSpinner } from '@/components/DockSpinner'
import { Button } from '@/components/ui/button'
import { createLessonBoard, diagramQuery, lessonBoardQuery } from '@/features/diagrams/api'
import DiagramView from '@/features/diagrams/components/DiagramView'
import { errorMessage } from '@/lib/errors'
import { ownWrite } from '@/lib/realtime'

type Props = {
  lessonId: string
  lessonTitle: string
  teamId: string
  workspaceId: string
  /** Teachers (workspace managers) draw; everyone else watches. */
  canManage: boolean
}

/**
 * A lesson's Whiteboard tab (lazy: it brings React Flow). The board is an ordinary whiteboard tied
 * to the lesson (`diagrams.lesson_id`), so saving, the one-editor lock and live updates are the
 * whiteboard page's own. Teachers start it; students see it read-only.
 */
export default function LessonBoard({ lessonId, lessonTitle, teamId, workspaceId, canManage }: Props) {
  const queryClient = useQueryClient()
  const board = useQuery(lessonBoardQuery(lessonId))
  const diagram = useQuery({ ...diagramQuery(board.data?.id ?? ''), enabled: Boolean(board.data) })
  const start = useMutation({
    mutationFn: () => createLessonBoard({ teamId, workspaceId, lessonId, title: lessonTitle }),
    onSuccess: (created) => {
      ownWrite('diagrams', created.id)
      queryClient.setQueryData(lessonBoardQuery(lessonId).queryKey, created)
    },
    onError: (error) => {
      // Two teachers starting it at once: the second one just opens the first one's board.
      void queryClient.invalidateQueries({ queryKey: lessonBoardQuery(lessonId).queryKey })
      toast.error(errorMessage(error))
    },
  })

  if (board.isPending || (board.data && diagram.isPending)) {
    return (
      <div className="flex h-full items-center justify-center">
        <DockSpinner label="Loading the whiteboard" />
      </div>
    )
  }
  if (board.isError || diagram.isError) {
    return (
      <div role="alert" className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Couldn’t load the whiteboard.
        <Button variant="link" size="sm" onClick={() => void (board.isError ? board.refetch() : diagram.refetch())}>
          Try again
        </Button>
      </div>
    )
  }
  if (!board.data || !diagram.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Presentation className="size-8 text-muted-foreground" />
        {canManage ? (
          <>
            <p className="max-w-sm text-sm text-muted-foreground">Draw, write and add shapes or tables while you teach. Students see it here, read-only.</p>
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? 'Starting…' : 'Start the whiteboard'}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This lesson doesn’t have a whiteboard yet.</p>
        )}
      </div>
    )
  }
  return <DiagramView key={diagram.data.id} diagram={diagram.data} canWrite={canManage} embedded />
}
