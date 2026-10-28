import { redirect, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { errorMessage } from '@/lib/errors'
import { queryClient } from '@/lib/query-client'
import { workspaceIssuesQuery } from '@/features/issues/api'
import { myTeamsQuery } from '@/features/teams/api'
import { workspaceQuery } from '@/features/workspaces/api'
import { connectGitHub, githubInstallationsQuery, repoKeys, teamReposQuery, workspaceReposQuery } from './api'

/**
 * …/w/:workspaceId/github: the project's repos, the group's, the GitHub install and (with the Issues tool)
 * the issues for the counts, all at once. They used to start one after another as the page rendered.
 */
export async function githubTabLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  const workspaceId = params.workspaceId ?? ''
  void queryClient.prefetchQuery(workspaceReposQuery(workspaceId))
  // The group from the URL (cached memberships), so these don't wait for the workspace row.
  void queryClient.ensureQueryData(myTeamsQuery(user.id)).then((memberships) => {
    const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
    if (!team) return
    void queryClient.prefetchQuery(teamReposQuery(team.id))
    void queryClient.prefetchQuery(githubInstallationsQuery(team.id))
  }, () => {}) // a failure shows on the page, which reads the same queries
  // The open-issue counts, only with the Issues tool (that needs the workspace row).
  void queryClient.ensureQueryData(workspaceQuery(workspaceId)).then((workspace) => {
    if (workspace?.modules.includes('issues')) void queryClient.prefetchQuery(workspaceIssuesQuery(workspaceId))
  }, () => {})
  return null
}

/** What /github/callback shows when it doesn't redirect straight back to Group settings. */
export type GitHubCallbackResult =
  | { kind: 'requested' }
  | { kind: 'updated' }
  | { kind: 'error'; message: string }

/**
 * /github/callback: GitHub sends a group owner/admin here after installing
 * the DevDock App (?installation_id, ?code, ?state). The `github` Edge
 * Function verifies it all with GitHub; on success we go back to Group settings.
 */
export async function githubCallbackLoader({ request }: LoaderFunctionArgs): Promise<GitHubCallbackResult | Response> {
  await requireUser(request)
  const params = new URL(request.url).searchParams
  const setupAction = params.get('setup_action')
  const state = params.get('state')
  const code = params.get('code')
  const installationId = Number(params.get('installation_id'))

  // An org member asked an org owner to approve the install; nothing to connect yet.
  if (setupAction === 'request') return { kind: 'requested' }
  // Repo access changed from GitHub's settings: takes effect on GitHub right away.
  if (!state && setupAction === 'update') return { kind: 'updated' }
  if (!state || !code || !Number.isSafeInteger(installationId) || installationId <= 0) {
    return { kind: 'error', message: 'This GitHub link is incomplete. Start again from Group settings → Repositories.' }
  }

  try {
    const { teamSlug } = await connectGitHub({ state, code, installationId })
    await queryClient.invalidateQueries({ queryKey: repoKeys.all })
    return redirect(`/t/${teamSlug}/settings`)
  } catch (error) {
    return { kind: 'error', message: errorMessage(error) }
  }
}
