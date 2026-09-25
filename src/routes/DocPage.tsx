import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { documentQuery } from '@/features/docs/api'
import { useCanWriteDocs } from '@/features/docs/hooks'

// The editor (TipTap + highlight.js) is only downloaded when a doc is opened.
const DocView = lazy(() => import('@/features/docs/components/DocView'))

/**
 * One doc, at /t/:teamSlug/docs/:docId (team view) or …/w/:workspaceId/docs/:docId
 * (inside the workspace, under its tabs). docLoader has already checked it exists,
 * belongs to this team, and (in a workspace) to that workspace.
 */
export function DocPage() {
  const { docId = '' } = useParams()
  const doc = useSuspenseQuery(documentQuery(docId)).data
  const canWrite = useCanWriteDocs()(doc?.workspace_id ?? null)

  if (!doc) {
    return <p className="py-16 text-center text-sm text-muted-foreground">This doc doesn’t exist anymore.</p>
  }
  return (
    <Suspense fallback={<DocSkeleton />}>
      <DocView key={doc.id} doc={doc} canWrite={canWrite} />
    </Suspense>
  )
}

function DocSkeleton() {
  return (
    <div className="max-w-[820px] space-y-4 pl-6 md:pl-16">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-8 h-11 w-2/3" />
      <Skeleton className="h-3 w-40" />
      <div className="space-y-3 pt-8">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  )
}
