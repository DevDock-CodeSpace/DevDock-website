import { LoaderCircle } from 'lucide-react'

/** Full-screen placeholder while the session is restored or the OAuth callback completes. */
export function AuthLoading({ label = 'Loading DevDoc…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-svh items-center justify-center bg-background text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 font-mono text-sm">
        <LoaderCircle className="size-4 animate-spin" />
        {label}
      </div>
    </div>
  )
}
