import { QueryClient } from '@tanstack/react-query'

/**
 * For data the app shell shows on every page and that rarely changes (groups, the
 * workspace list, pins, saved views). Live updates (lib/realtime) invalidate it the
 * moment it changes and again after a reconnect, so coming back to the tab doesn't
 * need to ask for it again. Only for tables that send realtime events.
 */
export const SETTLED_STALE_MS = 10 * 60_000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Coming back to the tab refreshes what's on screen if it's older than staleTime
      // (lib/realtime keeps it fresh in between; editors only take it when nothing is unsaved).
      refetchOnWindowFocus: true,
    },
  },
})
