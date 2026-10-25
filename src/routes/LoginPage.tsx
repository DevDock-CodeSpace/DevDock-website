import { CircleAlert, Clock, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useLoaderData } from 'react-router'
import { Button } from '@/components/ui/button'
import { rememberedChoice } from '@/features/auth/api'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { GoogleIcon } from '@/features/auth/components/GoogleIcon'
import { RememberMe } from '@/features/auth/components/RememberMe'
import { AuthFlowError, loginErrorMessages } from '@/features/auth/errors'
import { useSignInWithGoogle } from '@/features/auth/hooks'
import type { loginLoader } from '@/features/auth/loaders'

/** /login: Google sign-in for everyone (AuthShell draws the page). */
export function LoginPage() {
  const { next, error, inactive, expired } = useLoaderData<typeof loginLoader>()
  const signIn = useSignInWithGoogle(next)
  const [remember, setRemember] = useState(rememberedChoice)
  // After success the browser is navigating to Google; keep the button busy.
  const redirecting = signIn.isPending || signIn.isSuccess

  const message = signIn.isError
    ? signIn.error instanceof AuthFlowError
      ? signIn.error.message
      : loginErrorMessages.oauth
    : error && !redirecting
      ? loginErrorMessages[error]
      : null
  const notice =
    message || redirecting
      ? null
      : inactive
        ? 'You were signed out because you hadn’t used DevDock for a while. Sign in to pick up where you left off.'
        : expired
          ? 'Your sign-in reached its time limit. Sign in again to pick up where you left off.'
          : null

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your DevDock workspace.">
      {notice && (
        <div role="status" className="mb-6 flex gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {message && (
        <div role="alert" className="mb-6 flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <Button size="lg" className="h-11 w-full gap-2.5 text-sm" disabled={redirecting} onClick={() => signIn.mutate(remember)}>
        {redirecting ? (
          <LoaderCircle className="animate-spin" />
        ) : (
          <span className="flex size-5 items-center justify-center rounded-full bg-white">
            <GoogleIcon className="size-3.5" />
          </span>
        )}
        {redirecting ? 'Redirecting to Google…' : 'Continue with Google'}
      </Button>
      <p className="mt-2.5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0" />
        DevDock never sees your Google password.
      </p>

      <RememberMe checked={remember} onChange={setRemember} disabled={redirecting} className="mt-5" />

      <p className="mt-8 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
        New here? After signing in you can start a group, or join one with an invite code from your instructor or
        team.
      </p>
    </AuthShell>
  )
}
