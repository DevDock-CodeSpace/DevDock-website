import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/hooks'
import { deleteTeam, removeTeamMember, updateTeam, type TeamType } from '@/features/teams/api'
import { useCurrentTeam, useExitTeam } from '@/features/teams/hooks'
import { teamRoleLabel, teamTypes } from '@/features/teams/permissions'
import { errorMessage } from '@/lib/errors'

export function TeamSettingsPage() {
  const { team, role, can } = useCurrentTeam()

  return (
    <>
      <PageHeader title="Settings" description={`Team settings. Your role: ${teamRoleLabel[role]}.`} />
      <div className="space-y-6">
        <GeneralCard key={team.id} />
        {can.canLeave && <LeaveCard />}
        {can.canDelete && <DeleteCard />}
      </div>
    </>
  )
}

function GeneralCard() {
  const { team, can } = useCurrentTeam()
  const queryClient = useQueryClient()
  const [name, setName] = useState(team.name)
  const [type, setType] = useState<TeamType>(team.type)
  const dirty = name.trim().length > 0 && (name.trim() !== team.name || type !== team.type)

  const rename = useMutation({
    mutationFn: () => updateTeam(team.id, { name, type }),
    onSuccess: () => {
      toast.success('Team saved')
      return queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (dirty) rename.mutate()
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            {can.canEditTeam ? 'Owners and admins can change these.' : 'Only owners and admins can change these.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              value={name}
              maxLength={100}
              disabled={!can.canEditTeam}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as TeamType)} disabled={!can.canEditTeam}>
              <SelectTrigger id="team-type" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(teamTypes) as TeamType[]).map((value) => {
                  const { label, hint, icon: Icon } = teamTypes[value]
                  return (
                    <SelectItem key={value} value={value}>
                      <Icon className="text-muted-foreground" />
                      {label}
                      <span className="text-xs text-muted-foreground">· {hint}</span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <p className="font-mono text-sm text-muted-foreground">/t/{team.slug}</p>
          </div>
        </CardContent>
        {can.canEditTeam && (
          <CardFooter className="justify-end">
            <Button type="submit" disabled={!dirty || rename.isPending}>
              {rename.isPending && <LoaderCircle className="animate-spin" />}
              Save
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  )
}

function LeaveCard() {
  const { user } = useAuth()
  const { team } = useCurrentTeam()
  const exitTeam = useExitTeam()
  const [confirming, setConfirming] = useState(false)

  const leave = useMutation({
    mutationFn: () => removeTeamMember(team.id, user.id),
    onSuccess: async () => {
      toast.success(`You left ${team.name}`)
      await exitTeam(team.id)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave team</CardTitle>
        <CardDescription>You’ll lose access to this team and all of its workspaces.</CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <Button variant="outline" onClick={() => setConfirming(true)}>
          Leave team
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Leave ${team.name}?`}
        description="You’ll need a new invite code to come back."
        confirmLabel="Leave"
        pending={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
    </Card>
  )
}

function DeleteCard() {
  const { team } = useCurrentTeam()
  const exitTeam = useExitTeam()
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')

  const remove = useMutation({
    mutationFn: () => deleteTeam(team.id),
    onSuccess: async () => {
      toast.success(`${team.name} was deleted`)
      await exitTeam(team.id)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Card className="ring-destructive/30">
      <CardHeader>
        <CardTitle>Delete team</CardTitle>
        <CardDescription>
          Permanently deletes the team, its workspaces, memberships, and invite codes. This can’t be undone.
        </CardDescription>
      </CardHeader>
      <CardFooter className="justify-end">
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Delete team
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open)
          if (!open) setTyped('')
        }}
        title={`Delete ${team.name}?`}
        description="Everyone loses access immediately. Type the team name to confirm."
        confirmLabel="Delete forever"
        pending={remove.isPending}
        confirmDisabled={typed !== team.name}
        onConfirm={() => remove.mutate()}
      >
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={team.name} aria-label="Team name" />
      </ConfirmDialog>
    </Card>
  )
}
