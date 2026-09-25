import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Copy, LoaderCircle, Plus, Ticket, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage } from '@/lib/errors'
import { createInvite, invitesQuery, revokeInvite, type Invite } from '../api'
import { useCurrentTeam } from '../hooks'

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** Owners/admins: invite codes that let people join this team as members. */
export function InvitesPanel() {
  const { team } = useCurrentTeam()
  const invites = useSuspenseQuery(invitesQuery(team.id)).data
  const queryClient = useQueryClient()
  const [now] = useState(Date.now)

  const revoke = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => {
      toast.success('Invite revoked')
      return queryClient.invalidateQueries({ queryKey: invitesQuery(team.id).queryKey })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <section className="mt-12">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-medium">Invite codes</h2>
          <p className="text-sm text-muted-foreground">
            Anyone with a valid code can join as a <strong className="font-medium">member</strong>. Share it privately.
          </p>
        </div>
        <CreateInviteDialog />
      </div>

      {invites.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          <Ticket className="size-4" /> No invite codes yet.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {invites.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              now={now}
              revoking={revoke.isPending && revoke.variables === invite.id}
              onRevoke={() => revoke.mutate(invite.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function InviteRow({
  invite,
  now,
  revoking,
  onRevoke,
}: {
  invite: Invite
  now: number
  revoking: boolean
  onRevoke: () => void
}) {
  const expired = invite.expires_at !== null && new Date(invite.expires_at).getTime() <= now
  const usedUp = invite.max_uses !== null && invite.use_count >= invite.max_uses
  const active = !expired && !usedUp

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.code)
      toast.success('Invite code copied')
    } catch {
      toast.error('Couldn’t copy. Select the code and copy it manually.')
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <code className={`font-mono text-base tracking-wider ${active ? '' : 'text-muted-foreground line-through'}`}>
        {invite.code}
      </code>
      {!active && <Badge variant="outline">{expired ? 'Expired' : 'Used up'}</Badge>}
      <span className="font-mono text-xs text-muted-foreground">
        {invite.use_count}
        {invite.max_uses !== null ? ` / ${invite.max_uses}` : ''} used
        {' · '}
        {invite.expires_at ? `${expired ? 'expired' : 'expires'} ${dateFormat.format(new Date(invite.expires_at))}` : 'no expiry'}
      </span>
      <div className="ml-auto flex items-center gap-1">
        {active && (
          <Button variant="ghost" size="sm" onClick={copy}>
            <Copy /> Copy
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={revoking} onClick={onRevoke} aria-label={`Revoke ${invite.code}`}>
          {revoking ? <LoaderCircle className="animate-spin" /> : <X />} Revoke
        </Button>
      </div>
    </li>
  )
}

const EXPIRY_OPTIONS = { '7': '7 days', '30': '30 days', never: 'Never' } as const
const USES_OPTIONS = { unlimited: 'Unlimited', '1': '1 use', '10': '10 uses', '30': '30 uses' } as const

function CreateInviteDialog() {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [expiry, setExpiry] = useState<keyof typeof EXPIRY_OPTIONS>('7')
  const [uses, setUses] = useState<keyof typeof USES_OPTIONS>('unlimited')

  const create = useMutation({
    mutationFn: () =>
      createInvite(team.id, {
        expiresAt: expiry === 'never' ? null : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString(),
        maxUses: uses === 'unlimited' ? null : Number(uses),
      }),
    onSuccess: async (invite) => {
      await queryClient.invalidateQueries({ queryKey: invitesQuery(team.id).queryKey })
      setOpen(false)
      try {
        await navigator.clipboard.writeText(invite.code)
        toast.success(`Invite ${invite.code} created and copied`)
      } catch {
        toast.success(`Invite ${invite.code} created`)
      }
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) create.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> New invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New invite code</DialogTitle>
            <DialogDescription>
              People who use it join <strong className="font-medium">{team.name}</strong> as members. They
              won’t see any workspace until someone adds them to it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Expires after</Label>
              <Select value={expiry} onValueChange={(v) => setExpiry(v as keyof typeof EXPIRY_OPTIONS)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPIRY_OPTIONS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Uses</Label>
              <Select value={uses} onValueChange={(v) => setUses(v as keyof typeof USES_OPTIONS)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(USES_OPTIONS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {create.isError && (
            <p role="alert" className="text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <LoaderCircle className="animate-spin" />}
              Create invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
