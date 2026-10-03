import { useEffect, useRef } from 'react'

/** How long typing has to pause before text that saves itself is sent. */
export const AUTOSAVE_MS = 800

/**
 * Saves unsaved text when the tab goes to the background, and asks before the
 * tab closes or reloads while something is still unsaved (the save is started
 * either way). Leaving the page inside the app is handled by each field's unmount.
 */
export function useSaveOnExit(isDirty: () => boolean, flush: () => void) {
  const latest = useRef({ isDirty, flush })
  useEffect(() => {
    latest.current = { isDirty, flush }
  })
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') latest.current.flush()
    }
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!latest.current.isDirty()) return
      latest.current.flush()
      event.preventDefault()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])
}
