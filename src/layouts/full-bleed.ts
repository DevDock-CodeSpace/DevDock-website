import { useMatches } from 'react-router'
import { useLiveCall } from '@/features/live/call/context'

/** Put on a route (`handle: FULL_BLEED`) whose page fills the whole area under the top bar, with no page padding. */
export const FULL_BLEED = { fullBleed: true } as const

/**
 * Whether the page area drops its padding and width limit: a route that asks for it (Messages), or
 * the session page while a call is docked in it, so the call fills the screen instead of sitting in a box.
 */
export function useFullBleed() {
  const matches = useMatches()
  const { anchorEl } = useLiveCall()
  return anchorEl !== null || matches.some((match) => (match.handle as { fullBleed?: boolean } | undefined)?.fullBleed === true)
}
