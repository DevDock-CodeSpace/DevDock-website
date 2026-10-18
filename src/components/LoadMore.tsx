import { LoaderCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'

/**
 * The section's next page: on click, and with `auto` when the reader scrolls down to it. Only
 * the page's last section is `auto`: a section above it has its end on screen from the
 * start, which isn't the reader asking for more.
 */
export function LoadMore({
  query,
  auto,
}: {
  query: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => Promise<unknown> }
  auto: boolean
}) {
  const marker = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    const el = marker.current
    if (!auto || !el || !hasNextPage || isFetchingNextPage) return
    // Only when the reader scrolls down to it: an end that's on screen without scrolling
    // (a short list on a tall window) waits for "Show more" instead of loading by itself.
    let near = false
    let scrolled = false
    const load = () => near && scrolled && void fetchNextPage()
    // Start a little before the end is visible, so scrolling rarely waits.
    const observer = new IntersectionObserver(
      (entries) => {
        near = entries.some((e) => e.isIntersecting)
        load()
      },
      { rootMargin: '200px 0px' },
    )
    const onScroll = () => {
      scrolled = true
      load()
    }
    observer.observe(el)
    // Capture: the page area may be its own scroll container.
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll, { capture: true })
    }
  }, [auto, hasNextPage, isFetchingNextPage, fetchNextPage])

  if (!hasNextPage) return null
  return (
    <div ref={marker} className="flex justify-center py-3">
      <button
        type="button"
        onClick={() => void fetchNextPage()}
        disabled={isFetchingNextPage}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {isFetchingNextPage && <LoaderCircle className="size-3.5 animate-spin" />}
        {isFetchingNextPage ? 'Loading…' : 'Show more'}
      </button>
    </div>
  )
}
