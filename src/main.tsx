import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { startErrorTracking, reportError } from '@/lib/error-tracking'
import { queryClient } from '@/lib/query-client'
import { requestRecorderWanted } from '@/lib/request-recorder-flag'
import { watchForStaleBuild } from '@/lib/stale-build'
import { router } from '@/router'
import './index.css'

// A tab left open across a deploy reloads itself instead of failing to open pages.
watchForStaleBuild()

// Errors and page views go to PostHog when POSTHOG_KEY is set (the library loads after the first paint).
startErrorTracking()

// A measuring tool for request counts, loaded only when asked for with ?requests=1.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
if (supabaseUrl && requestRecorderWanted()) {
  void import('@/lib/request-recorder').then((m) => m.startRequestRecorder(supabaseUrl))
}

createRoot(document.getElementById('root')!, {
  // Errors outside the router's error pages (those report themselves in RouteErrorPage).
  onUncaughtError: (error) => {
    console.error(error)
    reportError(error, { source: 'react' })
  },
}).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
