import { useEffect, useState } from 'react'
import { useNavigation } from 'react-router'
import { DockSpinner } from '@/components/DockSpinner'

/**
 * DevDock's spinner over the page area while the next page's loader runs, so a click always shows
 * that something is happening. It appears only after 150 ms, so fast navigations show nothing; the
 * current page stays underneath (dimmed) until the next one is ready.
 */
export function NavigationSpinner() {
  const loading = useNavigation().state === 'loading'
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShown(loading), loading ? 150 : 0)
    return () => clearTimeout(timer)
  }, [loading])

  if (!loading || !shown) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-12 bottom-0 z-20 bg-background/40 duration-200 animate-in fade-in">
      {/* Sticky, so it stays in view on a page scrolled down. */}
      <div className="sticky top-[35vh] flex justify-center">
        <DockSpinner label="Loading the page" />
      </div>
    </div>
  )
}
