import { useEffect } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
import { isStaleBuildError, reloadForNewVersion } from '@/lib/stale-build'
import { cn } from '@/lib/utils'

export function NotFoundPage() {
  return <ErrorScreen code="404" message="This page doesn't exist." />
}

/**
 * Route error boundary. `inline` renders inside the app layout (sidebar stays)
 * instead of taking over the whole screen.
 */
export function RouteErrorPage({ inline = false }: { inline?: boolean }) {
  const error = useRouteError()
  const staleBuild = isStaleBuildError(error)
  // A page from an older deploy: reload once to get the new version (see lib/stale-build).
  useEffect(() => {
    if (staleBuild) reloadForNewVersion()
  }, [staleBuild])

  if (staleBuild) return <UpdatedScreen inline={inline} />
  if (isRouteErrorResponse(error)) {
    const message =
      typeof error.data === 'string' && error.data ? error.data : error.status === 404 ? "This page doesn't exist." : 'Something went wrong.'
    return <ErrorScreen code={String(error.status)} message={message} inline={inline} />
  }
  // Log the details; never show raw error text.
  if (error instanceof Error) console.error('[route] Unhandled error', error)
  return <ErrorScreen code="error" message="Something went wrong." inline={inline} />
}

/** Shown if the automatic reload was skipped (it already happened a moment ago). */
function UpdatedScreen({ inline }: { inline: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 p-4 text-center',
        inline ? 'py-24' : 'min-h-svh bg-background',
      )}
    >
      <p className="font-mono text-sm text-muted-foreground">update</p>
      <h1 className="text-xl font-semibold">DevDock was just updated.</h1>
      <p className="text-sm text-muted-foreground">Reload the page to continue with the new version.</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  )
}

function ErrorScreen({ code, message, inline = false }: { code: string; message: string; inline?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 p-4 text-center',
        inline ? 'py-24' : 'min-h-svh bg-background',
      )}
    >
      <p className="font-mono text-sm text-muted-foreground">{code}</p>
      <h1 className="text-xl font-semibold">{message}</h1>
      <Button asChild variant="outline">
        <Link to="/app">Back to your group</Link>
      </Button>
    </div>
  )
}
