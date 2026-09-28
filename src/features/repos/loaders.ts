import { redirect, type LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { errorMessage } from '@/lib/errors'
import { queryClient } from '@/lib/query-client'
import { connectGitHub, repoKeys } from './api'

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
