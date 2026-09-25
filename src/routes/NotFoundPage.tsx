import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
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
  if (isRouteErrorResponse(error)) {
    const message =
      typeof error.data === 'string' && error.data ? error.data : error.status === 404 ? "This page doesn't exist." : 'Something went wrong.'
    return <ErrorScreen code={String(error.status)} message={message} inline={inline} />
  }
  if (error instanceof Error) console.error('[route] Unhandled error', error)
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return <ErrorScreen code="error" message={message} inline={inline} />
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
        <Link to="/app">Back to your workspace</Link>
      </Button>
    </div>
  )
}
