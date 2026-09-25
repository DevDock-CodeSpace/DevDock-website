import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageHeader } from '@/components/PageHeader'
import { DangerRow, SettingsSection } from '@/components/SettingsSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/features/auth/hooks'
import { deleteTeam, removeTeamMember, updateTeam, type TeamType } from '@/features/teams/api'
import { useCurrentTeam, useExitTeam } from '@/features/teams/hooks'
import { defaultWorkspaceType, teamRoleLabel, teamTypes, workspaceTypes } from '@/features/teams/permissions'
import { errorMessage } from '@/lib/errors'

export function TeamSettingsPage() {
  const { team, role, can } = useCurrentTeam()

  return (
    <>
      <PageHeader title="Group settings" description={`${team.name} · your role: ${teamRoleLabel[role]}`} />
      <div>
        <GeneralSection key={team.id} />
        {(can.canLeave || can.canDelete) && <DangerSection />}
      </div>
    </>
  )
}

function GeneralSection() {
  const { team, can } = useCurrentTeam()
  const queryClient = useQueryClient()
  const [name, setName] = useState(team.name)
  const [type, setType] = useState<TeamType>(team.type)
  const dirty = name.trim().length > 0 && (name.trim() !== team.name || type !== team.type)

  const save = useMutation({
    mutationFn: () => updateTeam(team.id, { name, type }),
    onSuccess: () => {
      toast.success('Saved')
      return queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (dirty) save.mutate()
  }

  return (
    <SettingsSection
      title="General"
      description={
        can.canEditTeam
          ? `The type picks the default for new workspaces (${workspaceTypes[defaultWorkspaceType[type]].noun}) and which sidebar section comes first. Any group can hold courses, projects and workspaces.`
          : 'Only owners and admins can change these.'
      }
    >
      <form onSubmit={submit} className="space-y-4">
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
            <SelectTrigger id="team-type" className="w-full">
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
        {can.canEditTeam && (
          <Button type="submit" size="sm" disabled={!dirty || save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            Save changes
          </Button>
        )}
      </form>
    </SettingsSection>
  )
}

function DangerSection() {
  const { user } = useAuth()
  const { team, can } = useCurrentTeam()
  const exitTeam = useExitTeam()
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null)
  const [typed, setTyped] = useState('')

  const leave = useMutation({
    mutationFn: () => removeTeamMember(team.id, user.id),
    onSuccess: async () => {
      toast.success(`You left ${team.name}`)
      await exitTeam(team.id)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => deleteTeam(team.id),
    onSuccess: async () => {
      toast.success(`${team.name} was deleted`)
      await exitTeam(team.id)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <SettingsSection title="Danger zone" tone="danger" description="These can’t be undone from here.">
      {can.canLeave && (
        <DangerRow
          title="Leave group"
          description="You’ll lose access to this group and all of its spaces. You’ll need a new invite to come back."
          action={
            <Button variant="outline" size="sm" onClick={() => setConfirm('leave')}>
              Leave
            </Button>
          }
        />
      )}
      {can.canDelete && (
        <DangerRow
          title="Delete group"
          description="Permanently deletes the group, its spaces, memberships, and invite codes."
          action={
            <Button variant="destructive" size="sm" onClick={() => setConfirm('delete')}>
              Delete
            </Button>
          }
        />
      )}

      <ConfirmDialog
        open={confirm === 'leave'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Leave ${team.name}?`}
        description="You’ll need a new invite code to come back."
        confirmLabel="Leave"
        pending={leave.isPending}
        onConfirm={() => leave.mutate()}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null)
            setTyped('')
          }
        }}
        title={`Delete ${team.name}?`}
        description="Everyone loses access immediately. Type the group name to confirm."
        confirmLabel="Delete forever"
        pending={remove.isPending}
        confirmDisabled={typed !== team.name}
        onConfirm={() => remove.mutate()}
      >
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={team.name} aria-label="Group name" />
      </ConfirmDialog>
    </SettingsSection>
  )
}
