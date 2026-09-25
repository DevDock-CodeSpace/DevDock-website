import { LoaderCircle, Maximize2, PhoneOff } from 'lucide-react'
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
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const startCall = useCallback((next: ActiveCall) => setCall(next), [])
  const endCall = useCallback(() => setCall(null), [])
  const value = useMemo(
    () => ({ call, anchorEl, startCall, endCall, setAnchorEl }),
    [call, anchorEl, startCall, endCall],
  )
  return <LiveCallContext.Provider value={value}>{children}</LiveCallContext.Provider>
}

/**
 * The single, persistent home of the active call's iframe. Rendered once at the
 * app shell so it survives route changes. When the session page is open it
 * tracks that page's anchor box (docked); otherwise it floats bottom-right.
 */
export function CallDock() {
  const { call, anchorEl, endCall } = useLiveCall()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const docked = anchorEl !== null

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
    <div
      ref={containerRef}
      className={cn(
        'fixed z-50 flex flex-col overflow-hidden bg-muted shadow-lg',
        docked ? 'rounded-lg border' : 'right-4 bottom-4 h-[248px] w-[360px] rounded-xl border',
      )}
    >
      {!docked && (
        <div className="flex items-center gap-1 border-b bg-background/95 py-1.5 pr-1.5 pl-2.5">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-destructive" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{call.title}</span>
          <Button variant="ghost" size="icon-sm" aria-label="Return to session" onClick={() => navigate(call.returnTo)}>
            <Maximize2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Leave call"
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
  )
}

function Connecting() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      <LoaderCircle className="mr-2 size-4 animate-spin" /> Connecting…
    </div>
  )
}
