import { QueryClient } from '@tanstack/react-query'

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
