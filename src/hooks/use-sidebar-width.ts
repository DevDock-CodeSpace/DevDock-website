import { useCallback, useEffect, useState } from 'react'
import { clampWidth, maxWidthFor, readStoredWidth, SIDEBAR_DEFAULT, SIDEBAR_MIN, storeWidth } from '@/lib/sidebar-width'

/**
 * The sidebar's width: what the person chose (remembered per browser), always within the limits and
 * never so wide that a narrow window is left with no room for the page.
 */
export function useSidebarWidth() {
  const [chosen, setChosen] = useState(readStoredWidth)
  const [viewport, setViewport] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const set = useCallback((next: number) => {
    const value = clampWidth(next, window.innerWidth)
    setChosen(value)
    storeWidth(value)
  }, [])
  const reset = useCallback(() => set(SIDEBAR_DEFAULT), [set])

  return { width: clampWidth(chosen, viewport), min: SIDEBAR_MIN, max: maxWidthFor(viewport), set, reset }
}

export type SidebarWidth = ReturnType<typeof useSidebarWidth>
