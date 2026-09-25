import { CircleAlert, LoaderCircle } from 'lucide-react'
import { Link, useLoaderData } from 'react-router'
import { LogoMark, LogoWordmark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { GoogleIcon } from '@/features/auth/components/GoogleIcon'
import { AuthFlowError, loginErrorMessages } from '@/features/auth/errors'
import { useSignInWithGoogle } from '@/features/auth/hooks'
import type { loginLoader } from '@/features/auth/loaders'

export function LoginPage() {
  const { next, error } = useLoaderData<typeof loginLoader>()
  const signIn = useSignInWithGoogle(next)
  // After success the browser is navigating to Google; keep the button busy.
  const redirecting = signIn.isPending || signIn.isSuccess

  const message = signIn.isError
    ? signIn.error instanceof AuthFlowError
      ? signIn.error.message
      : loginErrorMessages.oauth
    : error && !redirecting
      ? loginErrorMessages[error]
      : null

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-background px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <main className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <LogoMark className="h-11" />
          <LogoWordmark className="h-7" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A workspace for learning and teaching software engineering.
        </p>

        {message && (
          <div
            role="alert"
            className="mt-6 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <Button
          size="lg"
          variant="outline"
          className="mt-6 h-10 w-full"
          disabled={redirecting}
          onClick={() => signIn.mutate()}
        >
          {redirecting ? <LoaderCircle className="animate-spin" /> : <GoogleIcon className="size-4" />}
          {redirecting ? 'Redirecting to Google…' : 'Continue with Google'}
        </Button>
        <p className="mt-6 text-xs text-muted-foreground">
          By continuing you agree to how DevDock handles your data; see the{' '}
          <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
            privacy policy
          </Link>
          .
        </p>
      </main>
    </div>
  )
}
