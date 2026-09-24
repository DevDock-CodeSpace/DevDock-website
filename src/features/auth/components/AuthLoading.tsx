import { LoaderCircle } from 'lucide-react'
import { LogoMark } from '@/components/Logo'

/** Full-screen placeholder while the session is restored or the OAuth callback completes. */
export function AuthLoading({ label = 'Loading DevDock…' }: { label?: string }) {
  return (
    <div
      className="flex min-h-svh items-center justify-center bg-background text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5">
        <LogoMark className="h-12" />
        <div className="flex items-center gap-2 font-mono text-sm">
          <LoaderCircle className="size-4 animate-spin" />
          {label}
        </div>
      </div>
    </div>
  )
}
