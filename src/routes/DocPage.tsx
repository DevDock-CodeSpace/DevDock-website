import { useSuspenseQuery } from '@tanstack/react-query'
import { Suspense } from 'react'
import { useParams } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { documentQuery } from '@/features/docs/api'
import { useCanEditDocs, useCanWriteDocs } from '@/features/docs/hooks'
import { docView } from '@/features/docs/screens'

// The editor (TipTap + highlight.js) is only downloaded when a doc is opened (docLoader starts it with the data).
const DocView = docView.Component

/**
 * One doc, at /t/:teamSlug/docs/:docId (team view) or …/w/:workspaceId/docs/:docId
 * (inside the workspace, under its tabs). docLoader has already checked it exists,
 * belongs to this team, and (in a workspace) to that workspace.
 */
export function DocPage() {
  const { docId = '' } = useParams()
  const doc = useSuspenseQuery(documentQuery(docId)).data
  // The role rules, narrowed by how it's shared (a viewer of a restricted doc only reads it).
  const level = doc?.access_level ?? 0
  const canEdit = (useCanEditDocs()(doc?.workspace_id ?? null) && level === 3) || level === 2
  const canDelete = useCanWriteDocs()(doc?.workspace_id ?? null) && level === 3

  if (!doc) {
    return <p className="py-16 text-center text-sm text-muted-foreground">This doc doesn’t exist anymore.</p>
  }
  return (
    <Suspense fallback={<DocSkeleton />}>
      <DocView key={doc.id} doc={doc} canEdit={canEdit} canDelete={canDelete} />
    </Suspense>
  )
}

function DocSkeleton() {
  return (
    <div className="space-y-4 pl-6 md:pl-16">
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
