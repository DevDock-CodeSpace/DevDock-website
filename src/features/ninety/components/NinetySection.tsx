import { useMutation, useQuery, useQueryClient, useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { CircleAlert, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SettingsSection } from '@/components/SettingsSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import { timeSince } from '@/lib/format'
import {
  connectNinety,
  disconnectNinety,
  ninetyConnectionQuery,
  ninetyKeys,
  ninetyLinksQuery,
  ninetyStatusQuery,
  ninetyTeamsQuery,
  setProjectNinetyTeam,
  setRocksNinetyTeam,
  syncNinetyNow,
  type NinetyConnection,
  type NinetyStatus,
} from '../api'

const TOKEN_PAGE = 'https://app.ninety.io/settings/user/developer-settings'
const NOT_LINKED = 'none'

/**
 * Group settings → Ninety (EOS): connect the group to Ninety and choose, per project, the Ninety team
 * its sprint issues go to as To-Dos. Shown to owners/admins of groups with the ninety_sync flag
 * (TeamSettingsPage); the database and the function check both again.
 */
export function NinetySection() {
  const { team } = useCurrentTeam()
  const [{ data: connection }, { data: status }] = useSuspenseQueries({
    queries: [ninetyConnectionQuery(team.id), ninetyStatusQuery(team.id)],
  })

  return (
    <SettingsSection
      title="EOS"
      description={
        <>
          Connects DevDock to Ninety, your EOS software, and keeps it up to date, so your EOS meeting needs no typing twice: each project’s running sprint becomes
          To-Dos (assigned issues only), issues labelled IDS go on the meeting’s IDS list, and plans become Rocks, with their dated
          issues as Milestones. Changes are sent twice a day (00:00 and 12:00 UTC), or at once with Sync now.
        </>
      }
    >
      {connection ? <Connected connection={connection} status={status} /> : <ConnectForm />}
    </SettingsSection>
  )
}

function ConnectForm({ replacing = false, onDone }: { replacing?: boolean; onDone?: () => void }) {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')
  const connect = useMutation({
    mutationFn: () => connectNinety(team.id, token),
    onSuccess: ({ owner }) => {
      setToken('')
      toast.success(replacing ? 'Ninety token replaced' : `Connected to Ninety as ${owner}`)
      onDone?.()
      return queryClient.invalidateQueries({ queryKey: ninetyKeys.all(team.id) })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (token.trim()) connect.mutate()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ninety-token">{replacing ? 'New Ninety access token' : 'Ninety personal access token'}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="ninety-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="pat_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="font-mono"
          />
          <Button type="submit" disabled={!token.trim() || connect.isPending} className="shrink-0">
            {connect.isPending && <LoaderCircle className="animate-spin" />}
            {replacing ? 'Replace token' : 'Connect Ninety'}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Make one in Ninety under{' '}
        <a href={TOKEN_PAGE} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground underline-offset-4 hover:underline">
          Settings → Developer Settings <ExternalLink className="size-3" />
        </a>{' '}
        (choose 365 days). It acts as you in Ninety, so To-Dos are created with your access. DevDock keeps it encrypted and never shows it
        again.
      </p>
    </form>
  )
}

function Connected({ connection, status }: { connection: NinetyConnection; status: NinetyStatus }) {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const [now] = useState(Date.now)
  const [replacing, setReplacing] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ninetyKeys.all(team.id) })
  const sync = useMutation({
    mutationFn: () => syncNinetyNow(team.id),
    onSuccess: (r) => {
      if (r.stopped) toast.error('Ninety stopped the sync part-way. See the message below.')
      else if (r.failed) toast.error(`${r.sent} sent, ${r.failed} couldn’t be sent. DevDock will try those again.`)
      else toast.success(r.sent ? `Sent ${r.sent} ${r.sent === 1 ? 'change' : 'changes'} to Ninety` : 'Ninety is up to date')
      return refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const disconnect = useMutation({
    mutationFn: () => disconnectNinety(team.id),
    onSuccess: () => {
      setConfirmDisconnect(false)
      toast.success('Ninety disconnected')
      return refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">
            Connected <span className="font-normal text-muted-foreground">· token …{connection.token_hint}</span>
          </p>
          <p className="text-muted-foreground">
            {connection.last_sync_at ? `Last sent ${timeSince(connection.last_sync_at, now)}` : 'Nothing sent yet'} ·{' '}
            <span className="font-mono tabular-nums">{status.todos}</span> open {status.todos === 1 ? 'To-Do' : 'To-Dos'} ·{' '}
            <span className="font-mono tabular-nums">{status.rocks}</span> {status.rocks === 1 ? 'Rock' : 'Rocks'} ·{' '}
            <span className="font-mono tabular-nums">{status.milestones}</span> {status.milestones === 1 ? 'Milestone' : 'Milestones'} ·{' '}
            <span className="font-mono tabular-nums">{status.ids}</span> on the IDS list
            {status.queued > 0 && (
              <>
                {' '}
                · <span className="font-mono tabular-nums">{status.queued}</span> waiting
              </>
            )}
          </p>
          {connection.ninety_owner_name && (
            <p className="text-muted-foreground">People who aren’t in Ninety: their To-Dos go to {connection.ninety_owner_name}, with their name in the title.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Sync now
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setReplacing((v) => !v)}>
            Replace token
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDisconnect(true)}>
            Disconnect
          </Button>
        </div>
      </div>

      {(connection.last_error || status.failing > 0) && (
        <div role="alert" className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {connection.last_error ??
              `${status.failing} ${status.failing === 1 ? 'issue' : 'issues'} couldn’t be sent (${status.last_failure ?? 'error'}). Sync now tries again.`}
          </span>
        </div>
      )}

      {replacing && <ConnectForm replacing onDone={() => setReplacing(false)} />}

      <RocksTeam connection={connection} />

      <ProjectLinks />

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Ninety?"
        description="DevDock stops sending to Ninety and forgets the token and which project goes to which team. To-Dos already in Ninety stay there."
        confirmLabel="Disconnect"
        pending={disconnect.isPending}
        onConfirm={() => disconnect.mutate()}
      />
    </div>
  )
}

function ProjectLinks() {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data.filter((w) => w.modules.includes('issues'))
  const links = useSuspenseQuery(ninetyLinksQuery(team.id)).data
  const teams = useQuery(ninetyTeamsQuery(team.id))
  const linkOf = new Map(links.map((l) => [l.workspace_id, l]))

  const setLink = useMutation({
    mutationFn: ({ workspaceId, ninetyTeamId }: { workspaceId: string; ninetyTeamId: string }) =>
      setProjectNinetyTeam(workspaceId, ninetyTeamId === NOT_LINKED ? null : (teams.data?.find((t) => t.id === ninetyTeamId) ?? null)),
    onSuccess: () => {
      toast.success('Saved. Its sprint is on its way to Ninety.')
      return queryClient.invalidateQueries({ queryKey: ninetyKeys.all(team.id) })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (workspaces.length === 0) return <p className="text-sm text-muted-foreground">No project uses Issues yet. Turn on Issues in a project to send it to Ninety.</p>

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Projects → Ninety teams</p>
      {teams.isError && <p className="text-sm text-destructive">{errorMessage(teams.error)}</p>}
      <ul className="divide-y border-y">
        {workspaces.map((w) => {
          const link = linkOf.get(w.id)
          const value = link?.ninety_team_id ?? NOT_LINKED
          // The saved team stays listed even before (or without) Ninety's list.
          const options = [...(teams.data ?? [])]
          if (link && !options.some((t) => t.id === link.ninety_team_id)) options.push({ id: link.ninety_team_id, name: link.ninety_team_name })
          return (
            <li key={w.id} data-ninety-project={w.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 truncate text-sm">{w.title}</span>
              <Select
                value={value}
                disabled={setLink.isPending || (teams.isPending && !link)}
                onValueChange={(next) => next && next !== value && setLink.mutate({ workspaceId: w.id, ninetyTeamId: next })}
              >
                <SelectTrigger className="w-full sm:w-56" aria-label={`Ninety team for ${w.title}`}>
                  <SelectValue placeholder={teams.isPending ? 'Loading Ninety teams…' : 'Not sent'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_LINKED}>Not sent to Ninety</SelectItem>
                  {options.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Plans are group-wide, so their Rocks go to one Ninety team for the whole group. */
function RocksTeam({ connection }: { connection: NinetyConnection }) {
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const teams = useQuery(ninetyTeamsQuery(team.id))
  const value = connection.rocks_ninety_team_id ?? NOT_LINKED
  const options = [...(teams.data ?? [])]
  if (connection.rocks_ninety_team_id && !options.some((t) => t.id === connection.rocks_ninety_team_id)) {
    options.push({ id: connection.rocks_ninety_team_id, name: connection.rocks_ninety_team_name ?? 'Saved team' })
  }
  const save = useMutation({
    mutationFn: (ninetyTeamId: string) => setRocksNinetyTeam(team.id, ninetyTeamId === NOT_LINKED ? null : (options.find((t) => t.id === ninetyTeamId) ?? null)),
    onSuccess: (_d, ninetyTeamId) => {
      toast.success(ninetyTeamId === NOT_LINKED ? 'Plans are no longer sent. Rocks already in Ninety stay.' : 'Saved. Your plans are on their way to Ninety as Rocks.')
      return queryClient.invalidateQueries({ queryKey: ninetyKeys.all(team.id) })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-ninety-rocks>
      <div className="text-sm">
        <p className="font-medium">Plans → Rocks</p>
        <p className="text-muted-foreground">Plans with a target date, led by their lead. Issues in a plan with a due date become its Milestones.</p>
      </div>
      <Select
        value={value}
        disabled={save.isPending || (teams.isPending && !connection.rocks_ninety_team_id)}
        onValueChange={(next) => next && next !== value && save.mutate(next)}
      >
        <SelectTrigger className="w-full shrink-0 sm:w-56" aria-label="Ninety team for Rocks">
          <SelectValue placeholder={teams.isPending ? 'Loading Ninety teams…' : 'Not sent'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NOT_LINKED}>Not sent to Ninety</SelectItem>
          {options.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
