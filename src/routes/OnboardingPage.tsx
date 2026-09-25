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
import { createTeam, joinTeam, myTeamsQuery, SLUG_PATTERN, type TeamType } from '@/features/teams/api'
import { teamPath } from '@/features/teams/nav'
import { teamTypes } from '@/features/teams/permissions'
import { slugify } from '@/features/teams/slug'
import { cn } from '@/lib/utils'

/** Create a team (→ owner) or join one with an invite code (→ member). */
export function OnboardingPage() {
  const { user } = useAuth()
  const memberships = useSuspenseQuery(myTeamsQuery(user.id)).data
  const isFirstTeam = memberships.length === 0

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

        {!isFirstTeam && (
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-4">
            <Link to="/app">
              <ArrowLeft /> Back to your team
            </Link>
          </Button>
        )}

        <h1 className="text-2xl font-semibold tracking-tight">
          {isFirstTeam ? 'Welcome to DevDock' : 'Create or join a team'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isFirstTeam
            ? 'Start your own team, or join one with an invite code from a teammate or instructor.'
            : 'You can belong to several teams, with a different role in each.'}
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <CreateTeamCard />
          <JoinTeamCard />
        </div>

        {isFirstTeam && <SignedInAs />}
      </main>
    </div>
  )
}

function CreateTeamCard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [type, setType] = useState<TeamType>('learning')
  const effectiveSlug = slugEdited ? slug : slugify(name)
  const slugValid = effectiveSlug.length >= 3 && effectiveSlug.length <= 48 && SLUG_PATTERN.test(effectiveSlug)

  const create = useMutation({
    mutationFn: () => createTeam({ name, slug: effectiveSlug, type }),
    onSuccess: async (team) => {
      await queryClient.invalidateQueries({ queryKey: ['teams'] })
      navigate(teamPath(team.slug))
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() && slugValid) create.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create a team</CardTitle>
        <CardDescription>For your class, cohort, or project group. You’ll be its owner.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submit}>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Type</legend>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(teamTypes) as TeamType[]).map((value) => {
                const { label, icon: Icon } = teamTypes[value]
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={type === value}
                    onClick={() => setType(value)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs transition-colors',
                      type === value ? 'border-primary bg-primary/5 font-medium' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">{teamTypes[type].hint}</p>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              value={name}
              maxLength={100}
              placeholder="Evening Cohort"
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-slug">URL</Label>
            <div className="flex items-center rounded-md border bg-muted/40 pl-3 font-mono text-sm focus-within:ring-2 focus-within:ring-ring/50">
              <span className="text-muted-foreground">/t/</span>
              <input
                id="team-slug"
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
            Create team
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function JoinTeamCard() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [code, setCode] = useState('')

  const join = useMutation({
    mutationFn: () => joinTeam(code),
    onSuccess: async (teamId) => {
      await queryClient.invalidateQueries({ queryKey: ['teams'] })
      const memberships = await queryClient.fetchQuery(myTeamsQuery(user.id))
      const joined = memberships.find((m) => m.team.id === teamId)
      navigate(joined ? teamPath(joined.team.slug) : '/app')
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
        <CardDescription>You’ll join as a member. Workspace access is granted separately.</CardDescription>
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
            Join team
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
