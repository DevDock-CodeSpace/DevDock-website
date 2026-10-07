import { ChevronUp, LoaderCircle, Maximize2, Minus, PhoneOff } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LiveCallContext, useLiveCall, type ActiveCall } from './context'

// The Jitsi SDK is only downloaded once a call is active.
const JitsiRoom = lazy(() => import('../components/JitsiRoom'))

/** Holds the one active call so it survives navigation. Wrap the app shell in this. */
export function LiveCallProvider({ children }: { children: ReactNode }) {
  const [call, setCall] = useState<ActiveCall | null>(null)
  const [anchorEl, setAnchor] = useState<HTMLElement | null>(null)
  const [minimized, setMinimized] = useState(false)
  // A new call starts in view; ending one forgets the preference.
  const startCall = useCallback((next: ActiveCall) => {
    setMinimized(false)
    setCall(next)
  }, [])
  const endCall = useCallback(() => {
    setMinimized(false)
    setCall(null)
  }, [])
  // Coming back to the session page brings the call back into view; leaving it again floats it normally.
  const setAnchorEl = useCallback((el: HTMLElement | null) => {
    if (el) setMinimized(false)
    setAnchor(el)
  }, [])
  const value = useMemo(
    () => ({ call, anchorEl, minimized, setMinimized, startCall, endCall, setAnchorEl }),
    [call, anchorEl, minimized, startCall, endCall, setAnchorEl],
  )
  return <LiveCallContext.Provider value={value}>{children}</LiveCallContext.Provider>
}

/**
 * The single, persistent home of the active call's iframe. Rendered once at the
 * app shell so it survives route changes. When the session page is open it
 * tracks that page's anchor box (docked); otherwise it floats bottom-right, and
 * can be minimized to a small pill (still connected) so it isn't in the way.
 */
export function CallDock() {
  const { call, anchorEl, minimized, setMinimized, endCall } = useLiveCall()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const docked = anchorEl !== null
  const hidden = minimized && !docked

  // While docked, follow the anchor's box every frame (covers scroll, resize and
  // the sidebar's open/close animation without extra listeners).
  useEffect(() => {
    if (!call || !anchorEl) return
    let raf = 0
    const follow = () => {
      const el = containerRef.current
      if (el) {
        const r = anchorEl.getBoundingClientRect()
        el.style.top = `${r.top}px`
        el.style.left = `${r.left}px`
        el.style.width = `${r.width}px`
        el.style.height = `${r.height}px`
      }
      raf = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(raf)
  }, [call, anchorEl])

  // Clear the docked coordinates when switching to the floating layout.
  useEffect(() => {
    if (anchorEl || !containerRef.current) return
    const el = containerRef.current
    el.style.top = el.style.left = el.style.width = el.style.height = ''
  }, [anchorEl])

  if (!call) return null

  return (
    <>
      {/* Kept mounted while minimized (just hidden), so the call, its audio and its connection carry on. */}
      <div
        ref={containerRef}
        aria-hidden={hidden || undefined}
        inert={hidden}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden bg-muted',
          // Docked it is part of the page (no frame); floating it is a window.
          !docked && 'right-4 bottom-4 h-[248px] w-[min(360px,calc(100vw-2rem))] rounded-xl border shadow-lg',
          hidden && 'pointer-events-none invisible',
        )}
      >
        {!docked && (
          <div className="flex items-center gap-1 border-b bg-background/95 py-1.5 pr-1.5 pl-2.5">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{call.title}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Hide call window" title="Hide (the call keeps running)" onClick={() => setMinimized(true)}>
              <Minus />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Return to meeting" title="Return to meeting" onClick={() => navigate(call.returnTo)}>
              <Maximize2 />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Leave call"
              title="Leave call"
              className="text-muted-foreground hover:text-destructive"
              onClick={endCall}
            >
              <PhoneOff />
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <Suspense fallback={<Connecting />}>
            <JitsiRoom
              jaas={call.jaas}
              subject={call.title}
              displayName={call.displayName}
              email={call.email}
              onLeave={endCall}
            />
          </Suspense>
        </div>
      </div>

      {hidden && (
        <div role="region" aria-label="Call in progress" className="fixed right-4 bottom-4 z-50 flex h-10 max-w-[calc(100vw-2rem)] items-center gap-0.5 rounded-full border bg-background py-1 pr-1 pl-3 shadow-lg">
          <span className="mr-1.5 size-2 shrink-0 animate-pulse rounded-full bg-destructive" aria-hidden />
          <span className="max-w-40 min-w-0 truncate text-xs font-medium">{call.title}</span>
          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Show call window" title="Show call" onClick={() => setMinimized(false)}>
            <ChevronUp />
          </Button>
          <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label="Return to meeting" title="Return to meeting" onClick={() => navigate(call.returnTo)}>
            <Maximize2 />
          </Button>
          <Button variant="ghost" size="icon-sm" className="rounded-full text-muted-foreground hover:text-destructive" aria-label="Leave call" title="Leave call" onClick={endCall}>
            <PhoneOff />
          </Button>
        </div>
      )}
    </>
  )
}

function Connecting() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <LoaderCircle className="mr-2 size-4 animate-spin" /> Connecting…
    </div>
  )
}
