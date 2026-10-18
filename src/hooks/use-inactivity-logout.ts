import { useCallback, useEffect, useRef } from 'react'
import { ACTIVITY_KEY, createInactivityWatch, type InactivityWatch } from '@/lib/inactivity'
import { INACTIVITY_CHECK_MS } from '@/lib/inactivity-config'

type Options = {
  limitMs: number
  warningMs: number
  /** The warning is due (`deadline` is when the sign-out happens), or `null` when activity ended it. */
  onWarn: (deadline: number | null) => void
  /** The limit has passed: sign out. Rejecting makes the next check try again. */
  onLogout: () => Promise<void>
}

// Only what a person does. Not `scroll`: the page scrolls itself (a chat list
// following new messages), and a person's own scrolling arrives as wheel, touch,
// keys or a press on the scrollbar.
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'] as const

/**
 * Signs the person out after `limitMs` without input in any of their tabs (see
 * lib/inactivity for how it is decided). Returns `staySignedIn`, for the warning's
 * button. Nothing here re-renders: input only moves a timestamp.
 */
export function useInactivityLogout({ limitMs, warningMs, onWarn, onLogout }: Options) {
  const watch = useRef<InactivityWatch | null>(null)
  const latest = useRef({ onWarn, onLogout })
  useEffect(() => {
    latest.current = { onWarn, onLogout }
  })

  useEffect(() => {
    let deadlineTimer: number | undefined
    const running = createInactivityWatch({
      limitMs,
      warningMs,
      onWarn: (deadline) => {
        // The 30 s check is too coarse for a countdown: look again when it reaches zero.
        window.clearTimeout(deadlineTimer)
        deadlineTimer = window.setTimeout(() => running.check(), Math.max(0, deadline - Date.now()) + 50)
        latest.current.onWarn(deadline)
      },
      onActive: () => {
        window.clearTimeout(deadlineTimer)
        latest.current.onWarn(null)
      },
      onExpire: () => latest.current.onLogout(),
    })
    watch.current = running

    // Browsers also send pointermove when the page changes under a pointer that hasn't
    // moved; those, and events the page dispatches itself, aren't anyone's input.
    let pointerAt = ''
    const onInput = (event: Event) => {
      if (!event.isTrusted) return
      if (event.type === 'pointermove') {
        const { screenX, screenY } = event as PointerEvent
        const at = `${screenX},${screenY}`
        if (at === pointerAt) return
        pointerAt = at
      }
      running.activity()
    }
    const check = () => void running.check()
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    // Another tab recorded activity (or cleared the clock by signing out).
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVITY_KEY || event.key === null) check()
    }

    // Capture: scroll doesn't bubble, and a handler that stops propagation shouldn't hide input.
    for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true, capture: true })
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    window.addEventListener('online', check)
    window.addEventListener('storage', onStorage)
    const interval = window.setInterval(check, INACTIVITY_CHECK_MS)
    check()

    return () => {
      running.stop()
      watch.current = null
      window.clearTimeout(deadlineTimer)
      window.clearInterval(interval)
      for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput, { capture: true })
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
      window.removeEventListener('online', check)
      window.removeEventListener('storage', onStorage)
    }
  }, [limitMs, warningMs])

  const staySignedIn = useCallback(() => watch.current?.activity(true), [])
  return { staySignedIn }
}
