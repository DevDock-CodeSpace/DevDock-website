import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FolderGit2, LoaderCircle, Lock } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { githubReposQuery, installationSettingsUrl, type GitHubInstallation, type GitHubRepo, type Repo } from '../api'

/**
 * The repos the group's GitHub installations can reach that aren't in the
 * group yet, with a filter. Asks GitHub (through the Edge Function) when shown.
 */
export function GitHubRepoChooser({
  teamId,
  groupRepos,
  installations,
  disabled,
  onPick,
}: {
  teamId: string
  groupRepos: Repo[]
  installations: GitHubInstallation[]
  disabled?: boolean
  onPick: (repo: GitHubRepo) => void
}) {
  const [query, setQuery] = useState('')
  const { data, isPending, isError, error } = useQuery(githubReposQuery(teamId))
  const q = query.trim().toLowerCase()
  const available = (data ?? []).filter(
    (r) =>
      !groupRepos.some((g) => g.github_repo_id === r.githubRepoId) &&
      `${r.owner}/${r.name}`.toLowerCase().includes(q),
  )

  return (
    <div className="space-y-2">
      {(data?.length ?? 0) > 8 && (
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter repositories…" className="h-8 text-xs" />
      )}
      {isPending ? (
        <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Asking GitHub…
        </p>
      ) : isError ? (
        <p role="alert" className="py-3 text-sm text-destructive">
          {error.message}
        </p>
      ) : available.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {q ? 'No matching repositories.' : 'Every repository DevDock can see is already in this group.'}
        </p>
      ) : (
        <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
          {available.map((repo) => (
            <li key={repo.githubRepoId}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(repo)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50"
              >
                <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs">
                  {repo.owner}/{repo.name}
                </span>
                {repo.private && <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Private" />}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">Add</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Missing one? Give DevDock access to it on GitHub:{' '}
        {installations.map((i, n) => (
          <span key={i.installation_id}>
            {n > 0 && ', '}
            <a
              href={installationSettingsUrl(i)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 underline underline-offset-4 hover:text-foreground"
            >
              {i.account_login}
              <ExternalLink className="size-3" />
            </a>
          </span>
        ))}
        .
      </p>
    </div>
  )
}
