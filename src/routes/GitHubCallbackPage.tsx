import { Link, useLoaderData } from 'react-router'
import { Button } from '@/components/ui/button'
import type { GitHubCallbackResult } from '@/features/repos/loaders'

const copy: Record<GitHubCallbackResult['kind'], { title: string; body?: string }> = {
  requested: {
    title: 'Install requested',
    body: 'An owner of that GitHub organization has to approve the DevDock app. Once they do, connect again from Group settings → Repositories.',
  },
  updated: {
    title: 'GitHub settings saved',
    body: 'Changes to which repositories DevDock can see apply right away.',
  },
  error: { title: 'GitHub wasn’t connected' },
}

/** Shown after the GitHub install round trip when it doesn't go straight back to Group settings. */
export function GitHubCallbackPage() {
  const result = useLoaderData() as GitHubCallbackResult
  const { title, body } = copy[result.kind]
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-4 text-center">
      <p className="font-mono text-sm text-muted-foreground">github</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{result.kind === 'error' ? result.message : body}</p>
      <Button asChild>
        <Link to="/app">Back to DevDock</Link>
      </Button>
    </div>
  )
}
