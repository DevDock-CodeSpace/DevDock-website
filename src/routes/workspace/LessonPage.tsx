import { useSuspenseQuery } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { useParams } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { lessonQuery } from '@/features/learning/api'

// The editor (TipTap) is only downloaded when a lesson is opened.
const LessonView = lazy(() => import('@/features/learning/components/LessonView'))

/** One lesson at …/w/:workspaceId/learning/:lessonId (lessonLoader has checked it's in this workspace). */
export function LessonPage() {
  const { lessonId = '' } = useParams()
  const lesson = useSuspenseQuery(lessonQuery(lessonId)).data
  if (!lesson) {
    return <p className="py-16 text-center text-sm text-muted-foreground">This lesson doesn’t exist anymore.</p>
  }
  return (
    <Suspense
      fallback={
        <div className="max-w-[760px] space-y-4">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      }
    >
      <LessonView key={lesson.id} lesson={lesson} />
    </Suspense>
  )
}
