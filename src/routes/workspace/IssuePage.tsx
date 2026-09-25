import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { issueQuery } from '@/features/issues/api'
import { useCurrentWorkspace } from '@/features/teams/hooks'

// The description editor (TipTap) is only downloaded when an issue is opened.
const IssueView = lazy(() => import('@/features/issues/components/IssueView'))

/** One issue at …/w/:workspaceId/issues/:issueNumber (issueLoader has checked it exists here). */
export function IssuePage() {
  const { issueNumber } = useParams()
  const { workspace } = useCurrentWorkspace()
  const issue = useSuspenseQuery(issueQuery(workspace.id, Number(issueNumber))).data

  if (!issue) {
    return <p className="py-16 text-center text-sm text-muted-foreground">This issue doesn’t exist anymore.</p>
  }
  return (
    <Suspense fallback={<IssueSkeleton />}>
      <IssueView key={issue.id} issue={issue} />
    </Suspense>
  )
}

function IssueSkeleton() {
  return (
    <div className="flex gap-10">
      <div className="flex-1 space-y-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <Skeleton className="hidden h-64 w-60 lg:block" />
    </div>
  )
}
