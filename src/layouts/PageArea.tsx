import { Suspense, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The area under the top bar. Normally left-aligned next to the sidebar with page padding and a
 * width limit; `fullBleed` (Messages, a docked call) drops both so the page fills it and sets its
 * own height. The elements are the same either way, only the classes change, so the page is never
 * remounted when a docked call switches the area over.
 */
export function PageArea({ fullBleed, children }: { fullBleed: boolean; children: ReactNode }) {
  return (
    <div className={fullBleed ? 'flex min-h-0 flex-1 flex-col' : 'flex-1 px-4 py-6 md:px-8 md:py-8 lg:px-12'}>
      <div className={fullBleed ? 'flex min-h-0 flex-1 flex-col' : 'w-full max-w-[1200px]'}>
        {/* Pages may load secondary data with useSuspenseQuery. */}
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </div>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
