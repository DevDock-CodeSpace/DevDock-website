import { CircleAlert, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLoaderData } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { rememberedChoice } from '@/features/auth/api'
import { AuthShell } from '@/features/auth/components/AuthShell'
import { RememberMe } from '@/features/auth/components/RememberMe'
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
  const [remember, setRemember] = useState(rememberedChoice)
  const busy = signIn.isPending || signIn.isSuccess

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (email.trim() && password) signIn.mutate({ email, password, remember })
  }
  const message = signIn.isError ? (signIn.error instanceof AuthFlowError ? signIn.error.message : loginErrorMessages.unavailable) : null

  return (
    <AuthShell title="Admin sign-in" subtitle="For the admin account. Everyone else signs in with Google.">
      {message && (
        <div role="alert" className="mb-6 flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="admin-email">Email</Label>
          <Input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
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
            className="h-10"
          />
        </div>
        <RememberMe checked={remember} onChange={setRemember} disabled={busy} />
        <Button type="submit" size="lg" className="h-11 w-full" disabled={busy || !email.trim() || !password}>
          {busy && <LoaderCircle className="animate-spin" />}
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="mt-8 border-t pt-5 text-xs text-muted-foreground">
        Not the admin?{' '}
        <Link to="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Sign in with Google
        </Link>
      </p>
    </AuthShell>
  )
}
