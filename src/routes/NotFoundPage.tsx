import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return <ErrorScreen code="404" message="This page doesn't exist." />
}

/** Route error boundary (e.g. a loader throwing for an unknown course). */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return <ErrorScreen code="error" message={message} />
}

function ErrorScreen({ code, message }: { code: string; message: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
      <p className="font-mono text-sm text-muted-foreground">{code}</p>
      <h1 className="text-xl font-semibold">{message}</h1>
      <Button asChild variant="outline">
        <Link to="/app">Back to workspace</Link>
      </Button>
    </div>
  )
}
