import { useEffect } from 'react'
import { inactivityExpiredNow } from '@/lib/inactivity'
import { REALTIME_PAUSE_AFTER_HIDDEN_MS } from '@/lib/inactivity-config'
import { refreshAfterGap, startRealtimeSync } from '@/lib/realtime'

/**
 * Keeps cached data live while the app shell is mounted (see lib/realtime).
 *
 * A tab nobody has looked at for a while stops listening: every change event
 * would otherwise refetch in it, and so would every reconnect, for a page no one
 * is reading. Looking at it again subscribes and asks once for what's on screen.
 */
export function useRealtimeSync() {
  useEffect(() => {
    let stop: (() => void) | null = startRealtimeSync()
    let timer: number | undefined

    const pause = () => {
      if (!stop || document.visibilityState !== 'hidden') return
      stop()
      stop = null
    }
    const onVisibility = () => {
      window.clearTimeout(timer)
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(pause, REALTIME_PAUSE_AFTER_HIDDEN_MS)
        return
      }
      // Away past the inactivity limit: the sign-out is under way, so don't reconnect for it.
      if (stop || inactivityExpiredNow()) return
      stop = startRealtimeSync()
      refreshAfterGap()
    }

    document.addEventListener('visibilitychange', onVisibility)
    onVisibility()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(timer)
      stop?.()
    }
  }, [])
}
