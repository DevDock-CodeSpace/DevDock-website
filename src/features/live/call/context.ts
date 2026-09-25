import { createContext, useContext } from 'react'
import type { JaasToken } from '../api'

// A live call that outlives the session page. The Jitsi iframe is rendered once
// by <CallDock> at the app shell, so navigating between pages/tabs no longer
// tears the call down: it stays docked over the session page and shrinks to a
// floating mini-window everywhere else.

export type ActiveCall = {
  sessionId: string
  jaas: JaasToken
  title: string
  displayName: string
  email: string
  /** Where the floating "return" button goes (the session's page). */
  returnTo: string
}

export type LiveCallValue = {
  call: ActiveCall | null
  /** The spot on the session page the call docks into; null = show it floating. */
  anchorEl: HTMLElement | null
  startCall: (call: ActiveCall) => void
  endCall: () => void
  setAnchorEl: (el: HTMLElement | null) => void
}

export const LiveCallContext = createContext<LiveCallValue | null>(null)

export function useLiveCall() {
  const ctx = useContext(LiveCallContext)
  if (!ctx) throw new Error('useLiveCall must be used within LiveCallProvider')
  return ctx
}
