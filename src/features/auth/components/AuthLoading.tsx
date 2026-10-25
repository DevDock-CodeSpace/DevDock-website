import { DockSpinner } from '@/components/DockSpinner'

/** Full-screen placeholder while the session is restored or the OAuth callback completes. */
export function AuthLoading({ label = 'Loading DevDock…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-svh items-center justify-center bg-background text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <DockSpinner className="size-14" label={null} />
        <p className="font-mono text-sm">{label}</p>
      </div>
    </div>
  )
}
