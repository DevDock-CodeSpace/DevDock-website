import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { LogoMark, LogoWordmark } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth, useSignOut, useUserIdentity } from '@/features/auth/hooks'
import { createWorkspace, joinWorkspace, myWorkspacesQuery, SLUG_PATTERN } from '@/features/workspaces/api'
import { workspacePath } from '@/features/workspaces/nav'
import { slugify } from '@/features/workspaces/slug'

/** Create a workspace (→ owner) or join one with an invite code (→ member). */
export function OnboardingPage() {
  const { user } = useAuth()
  const memberships = useSuspenseQuery(myWorkspacesQuery(user.id)).data
  const isFirstWorkspace = memberships.length === 0

  return (
    <div className="relative min-h-svh bg-background px-4 py-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <main className="mx-auto w-full max-w-3xl">
        <div className="mb-10 flex items-center gap-3">
          <LogoMark className="h-10" />
          <LogoWordmark className="h-6" />
        </div>

        {!isFirstWorkspace && (
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-4">
            <Link to="/app">
              <ArrowLeft /> Back to your workspace
            </Link>
          </Button>
        )}

        <h1 className="text-2xl font-semibold tracking-tight">
          {isFirstWorkspace ? 'Welcome to DevDock' : 'Create or join a workspace'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isFirstWorkspace
            ? 'Start your own workspace, or join one with an invite code from your instructor.'
            : 'You can belong to several workspaces, with a different role in each.'}
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <CreateWorkspaceCard />
          <JoinWorkspaceCard />
        </div>

        {isFirstWorkspace && <SignedInAs />}
      </main>
    </div>
  )
}

function CreateWorkspaceCard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const effectiveSlug = slugEdited ? slug : slugify(name)
  const slugValid = effectiveSlug.length >= 3 && effectiveSlug.length <= 48 && SLUG_PATTERN.test(effectiveSlug)

  const create = useMutation({
    mutationFn: () => createWorkspace({ name, slug: effectiveSlug }),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      navigate(workspacePath(workspace.slug))
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() && slugValid) create.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a workspace</CardTitle>
        <CardDescription>For your own class or group. You’ll be its owner.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Name</Label>
            <Input
              id="ws-name"
              value={name}
              maxLength={100}
              placeholder="Evening Cohort"
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-slug">URL</Label>
            <div className="flex items-center rounded-md border bg-muted/40 pl-3 font-mono text-sm focus-within:ring-2 focus-within:ring-ring/50">
              <span className="text-muted-foreground">/w/</span>
              <input
                id="ws-slug"
                className="h-8 min-w-0 flex-1 bg-transparent pr-3 outline-none"
                value={effectiveSlug}
                maxLength={48}
                placeholder="evening-cohort"
                aria-invalid={effectiveSlug !== '' && !slugValid}
                onChange={(e) => {
                  setSlugEdited(true)
                  setSlug(e.target.value.toLowerCase())
                }}
              />
            </div>
            {effectiveSlug !== '' && !slugValid && (
              <p className="text-xs text-destructive">3–48 lowercase letters, numbers, and single dashes.</p>
            )}
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={!name.trim() || !slugValid || create.isPending}>
            {create.isPending && <LoaderCircle className="animate-spin" />}
            Create workspace
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function JoinWorkspaceCard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [code, setCode] = useState('')

  const join = useMutation({
    mutationFn: () => joinWorkspace(code),
    onSuccess: async (workspaceId) => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] })
      const memberships = await queryClient.fetchQuery(myWorkspacesQuery(user.id))
      const joined = memberships.find((m) => m.workspace.id === workspaceId)
      navigate(joined ? workspacePath(joined.workspace.slug) : '/app')
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (code.trim()) join.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join with an invite code</CardTitle>
        <CardDescription>You’ll join as a member. Course access is granted separately.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              value={code}
              placeholder="XXXX-XXXX-XXXX"
              autoComplete="off"
              spellCheck={false}
              className="font-mono uppercase tracking-wider"
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          {join.isError && (
            <p role="alert" className="text-sm text-destructive">
              {join.error.message}
            </p>
          )}
          <Button type="submit" variant="outline" className="w-full" disabled={!code.trim() || join.isPending}>
            {join.isPending && <LoaderCircle className="animate-spin" />}
            Join workspace
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/** No sidebar here, so offer a way out for someone who signed in with the wrong account. */
function SignedInAs() {
  const { email, name } = useUserIdentity()
  const signOut = useSignOut()
  return (
    <p className="mt-10 text-sm text-muted-foreground">
      Signed in as <span className="font-medium text-foreground">{email ?? name}</span>.{' '}
      <button
        type="button"
        className="underline underline-offset-4 hover:text-foreground"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        Sign out
      </button>
    </p>
  )
}
