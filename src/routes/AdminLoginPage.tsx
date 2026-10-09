import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLoaderData } from 'react-router'
import { LogoMark, LogoWordmark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AuthFlowError, loginErrorMessages } from '@/features/auth/errors'
import { useSignInWithPassword } from '@/features/auth/hooks'
import type { loginLoader } from '@/features/auth/loaders'

/**
 * /admin-login: email + password for the admin account, which exists so the app
 * can be opened without a Google round trip (testing, automated checks). Not
 * linked from anywhere; everyone else uses /login.
 */
export function AdminLoginPage() {
  const { next } = useLoaderData<typeof loginLoader>()
  const signIn = useSignInWithPassword(next)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const busy = signIn.isPending || signIn.isSuccess

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (email.trim() && password) signIn.mutate({ email, password })
  }
  const message = signIn.isError ? (signIn.error instanceof AuthFlowError ? signIn.error.message : loginErrorMessages.unavailable) : null

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

        <h1 className="text-2xl font-semibold tracking-tight">Admin sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">For the admin account. Everyone else signs in with Google.</p>

        {message && (
          <div
            role="alert"
            className="mt-6 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="h-10 w-full" disabled={busy || !email.trim() || !password}>
            {busy && <LoaderCircle className="animate-spin" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          Not the admin?{' '}
          <Link to="/login" className="underline underline-offset-4 hover:text-foreground">
            Sign in with Google
          </Link>
          .
        </p>
      </main>
    </div>
  )
}
