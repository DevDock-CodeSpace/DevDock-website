import { useSuspenseQuery } from '@tanstack/react-query'
import { ExternalLink, FolderGit2, LoaderCircle, Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SettingsSection } from '@/components/SettingsSection'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCurrentTeam } from '@/features/teams/hooks'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import {
  githubAppSlug,
  githubInstallationsQuery,
  installationSettingsUrl,
  repoFullName,
  repoUrl,
  teamReposQuery,
  type GitHubInstallation,
  type TeamRepo,
} from '../api'
import { useAddGitHubRepo, useAddRepo, useConnectGitHub, useDeleteRepo, useDisconnectGitHub } from '../hooks'
import { GitHubMark } from './GitHubMark'
import { GitHubRepoChooser } from './GitHubRepoChooser'
import { NotConnectedBadge } from './NotConnectedBadge'

/**
 * Group settings → Repositories: the GitHub connection, then every repo in
 * the group and the projects using it. Owners/admins connect GitHub and add
 * and remove repos; projects link them from their GitHub tab.
 */
export function TeamReposSection() {
  const { team, can } = useCurrentTeam()
  const repos = useSuspenseQuery(teamReposQuery(team.id)).data
  const installations = useSuspenseQuery(githubInstallationsQuery(team.id)).data
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const [confirm, setConfirm] = useState<TeamRepo | null>(null)
  const remove = useDeleteRepo()
  const connected = installations.length > 0

  const usedBy = (repo: TeamRepo) =>
    repo.workspaceIds.map((id) => workspaces.find((w) => w.id === id)?.title).filter((t): t is string => !!t)

  return (
    <SettingsSection
      title="Repositories"
      description={
        can.isAdmin
          ? 'Connect GitHub, add the repositories your projects work in, then link them to projects from each project’s GitHub tab.'
          : 'GitHub repositories your projects work in. Only owners and admins can connect GitHub and add or remove repositories.'
      }
    >
      <GitHubConnection installations={installations} />

      {repos.length > 0 ? (
        <ul className="mt-6 divide-y border-y">
          {repos.map((repo) => {
            const projects = usedBy(repo)
            return (
              <li key={repo.id} className="flex items-center gap-3 py-2.5 text-sm">
                <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <a
                      href={repoUrl(repo)}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-mono text-xs hover:underline hover:underline-offset-4"
                    >
                      {repoFullName(repo)}
                    </a>
                    {connected && repo.installation_id === null && <NotConnectedBadge />}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {projects.length > 0 ? `Used by ${projects.join(', ')}` : 'Not linked to a project'}
                  </p>
                </div>
                {can.isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={`Remove ${repoFullName(repo)}`}
                    onClick={() => setConfirm(repo)}
                  >
                    <X />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">No repositories yet.</p>
      )}

      {can.isAdmin &&
        (connected ? (
          <AddFromGitHubDialog teamId={team.id} repos={repos} installations={installations} />
        ) : (
          <AddByNameForm teamId={team.id} />
        ))}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? `Remove ${repoFullName(confirm)}?` : ''}
        description={
          confirm && usedBy(confirm).length > 0
            ? `It’s unlinked from ${usedBy(confirm).join(', ')}, and their issues lose this repository (the issues stay). Nothing changes on GitHub.`
            : 'Nothing changes on GitHub.'
        }
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() =>
          confirm &&
          remove.mutate(confirm.id, {
            onSuccess: () => {
              toast.success(`Removed ${repoFullName(confirm)}`)
              setConfirm(null)
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </SettingsSection>
  )
}

/** "Connected to GitHub: acme" rows, and Connect / Disconnect for owners/admins. */
function GitHubConnection({ installations }: { installations: GitHubInstallation[] }) {
  const { team, can } = useCurrentTeam()
  const connect = useConnectGitHub(team.id)
  const disconnect = useDisconnectGitHub(team.id)
  const [confirm, setConfirm] = useState<GitHubInstallation | null>(null)

  if (installations.length === 0 && !can.isAdmin) return null

  return (
    <div className="space-y-2">
      {installations.map((i) => (
        <div key={i.installation_id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
          <GitHubMark className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate">
              Connected to <span className="font-medium">{i.account_login}</span>
            </p>
            <p className="text-xs text-muted-foreground">{i.account_type === 'Organization' ? 'GitHub organization' : 'GitHub account'}</p>
          </div>
          {can.isAdmin && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <a href={installationSettingsUrl(i)} target="_blank" rel="noreferrer">
                  Manage <ExternalLink />
                </a>
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirm(i)}>
                Disconnect
              </Button>
            </>
          )}
        </div>
      ))}

      {can.isAdmin &&
        (githubAppSlug ? (
          <div className="space-y-1">
            <Button
              variant={installations.length ? 'ghost' : 'outline'}
              size="sm"
              disabled={connect.isPending}
              onClick={() => connect.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}
            >
              {connect.isPending ? <LoaderCircle className="animate-spin" /> : <GitHubMark />}
              {installations.length ? 'Connect another GitHub account' : 'Connect GitHub'}
            </Button>
            {installations.length === 0 && (
              <p className="text-xs text-muted-foreground">
                GitHub asks which repositories DevDock may see. DevDock can then list them here and, later, create
                branches and follow pull requests.
              </p>
            )}
          </div>
        ) : (
          installations.length === 0 && (
            <p className="text-xs text-muted-foreground">GitHub isn’t set up for this DevDock yet, so repositories are added by name.</p>
          )
        ))}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm ? `Disconnect ${confirm.account_login}?` : ''}
        description="Repositories stay in the group and on their issues, but are marked Not connected. To remove DevDock’s access on GitHub too, uninstall it from Manage."
        confirmLabel="Disconnect"
        pending={disconnect.isPending}
        onConfirm={() =>
          confirm &&
          disconnect.mutate(confirm.installation_id, {
            onSuccess: () => {
              toast.success(`Disconnected ${confirm.account_login}`)
              setConfirm(null)
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </div>
  )
}

function AddFromGitHubDialog({
  teamId,
  repos,
  installations,
}: {
  teamId: string
  repos: TeamRepo[]
  installations: GitHubInstallation[]
}) {
  const [open, setOpen] = useState(false)
  const add = useAddGitHubRepo(teamId)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="mt-4">
          <Plus /> Add from GitHub
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a repository</DialogTitle>
          <DialogDescription>Repositories DevDock can see on GitHub that aren’t in this group yet.</DialogDescription>
        </DialogHeader>
        {open && (
          <GitHubRepoChooser
            teamId={teamId}
            groupRepos={repos}
            installations={installations}
            disabled={add.isPending}
            onPick={(repo) =>
              add.mutate(repo.githubRepoId, {
                onSuccess: (added) => {
                  toast.success(`Added ${repoFullName(added)}`)
                  setOpen(false)
                },
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Before GitHub is connected: add a repo by owner/name or URL (not checked with GitHub). */
function AddByNameForm({ teamId }: { teamId: string }) {
  const [text, setText] = useState('')
  const add = useAddRepo(teamId)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() || add.isPending) return
    add.mutate(text, {
      onSuccess: (repo) => {
        toast.success(`Added ${repoFullName(repo)}`)
        setText('')
      },
    })
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-2">
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (add.isError) add.reset()
          }}
          placeholder="owner/name or https://github.com/owner/name"
          aria-label="GitHub repository"
          className="font-mono text-xs"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!text.trim() || add.isPending}>
          {add.isPending && <LoaderCircle className="animate-spin" />}
          Add
        </Button>
      </div>
      {add.isError && (
        <p role="alert" className="text-sm text-destructive">
          {add.error.message}
        </p>
      )}
    </form>
  )
}
