import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, LoaderCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { createInvite, invitesQuery, type Invite } from '../api'
import { useCurrentTeam } from '../hooks'
import { teamPath } from '../nav'

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const WEEK_MS = 7 * 86_400_000

function isActive(invite: Invite, now: number) {
  const expired = invite.expires_at !== null && new Date(invite.expires_at).getTime() <= now
  const usedUp = invite.max_uses !== null && invite.use_count >= invite.max_uses
  return !expired && !usedUp
}

/**
 * Compact "invite someone new to the team" block for places like the
 * add-to-workspace dialog: shows the newest active team invite code (or lets
 * owners/admins create one). Uses useQuery, not useSuspenseQuery, because it
 * renders inside dialogs where suspending would blank the page behind.
 */
export function TeamInviteCode() {
  const { team, can } = useCurrentTeam()
  const queryClient = useQueryClient()
  const [now] = useState(Date.now)
  const invites = useQuery({ ...invitesQuery(team.id), enabled: can.canInvite })
  const active = invites.data?.find((invite) => isActive(invite, now))

  const create = useMutation({
    mutationFn: () => createInvite(team.id, { expiresAt: new Date(Date.now() + WEEK_MS).toISOString(), maxUses: null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesQuery(team.id).queryKey }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Invite code copied')
    } catch {
      toast.error('Couldn’t copy. Select the code and copy it manually.')
    }
  }

  return (
    <section className="space-y-2 rounded-lg border border-dashed p-3">
      <p className="text-sm font-medium">Someone new?</p>

      {!can.canInvite ? (
        <p className="text-sm text-muted-foreground">
          Ask a team owner or admin for an invite code. Once they join {team.name}, they’ll appear in the list above.
        </p>
      ) : invites.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Loading invite code…
        </p>
      ) : invites.isError ? (
        <p className="text-sm text-destructive">{invites.error.message}</p>
      ) : active ? (
        <>
          <p className="text-sm text-muted-foreground">
            Share this code. They join {team.name} as a member, then appear in the list above.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <code className="font-mono text-base tracking-wider">{active.code}</code>
            <Button type="button" variant="outline" size="sm" onClick={() => copy(active.code)}>
              <Copy /> Copy
            </Button>
            <span className="font-mono text-xs text-muted-foreground">
              {active.expires_at ? `expires ${dateFormat.format(new Date(active.expires_at))}` : 'no expiry'}
              {active.max_uses !== null && ` · ${active.max_uses - active.use_count} uses left`}
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Create a team invite code. People who use it join {team.name} as members, then appear in the list above.
          </p>
          <Button type="button" variant="outline" size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />} Create invite code
          </Button>
        </>
      )}

      {can.canInvite && (
        <p className="text-xs text-muted-foreground">
          <Link to={`${teamPath(team.slug)}/members`} className="underline underline-offset-4 hover:text-foreground">
            Manage invite codes
          </Link>
        </p>
      )}
    </section>
  )
}
