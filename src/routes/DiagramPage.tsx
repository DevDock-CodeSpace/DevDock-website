import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { diagramQuery } from '@/features/diagrams/api'
import { useCanWriteDiagrams } from '@/features/diagrams/hooks'

// The editor (React Flow) is only downloaded when a diagram is opened.
const DiagramView = lazy(() => import('@/features/diagrams/components/DiagramView'))

/**
 * One diagram, at /t/:teamSlug/diagrams/:diagramId (team view) or
 * …/w/:workspaceId/diagrams/:diagramId. diagramLoader has already checked it
 * exists, belongs to this team, and (in a workspace) to that workspace.
 */
export function DiagramPage() {
  const { diagramId = '' } = useParams()
  const diagram = useSuspenseQuery(diagramQuery(diagramId)).data
  const canWrite = useCanWriteDiagrams()(diagram?.workspace_id ?? null)

  if (!diagram) {
    return <p className="py-16 text-center text-sm text-muted-foreground">This diagram doesn’t exist anymore.</p>
  }
  return (
    <Suspense fallback={<DiagramSkeleton />}>
      <DiagramView key={diagram.id} diagram={diagram} canWrite={canWrite} />
    </Suspense>
  )
}

function DiagramSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-1/3" />
      <Skeleton className="h-[60vh] w-full" />
    </div>
  )
}
