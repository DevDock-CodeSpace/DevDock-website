// github: DevDock's side of the DevDock GitHub App. The App's private key and
// OAuth client secret never leave this function.
//
// POST { action, … } with the user's Supabase access token:
//   connect  { state, code, installationId } → { teamSlug, account }
//     After a group owner/admin installs the App, GitHub sends them back with
//     a one-time OAuth code. We check the state (from start_github_connect:
//     same person, ≤ 30 min old, used once), that they're still an owner/admin,
//     and, with their GitHub token, that they can really access that
//     installation (so nobody can attach someone else's installation id).
//     Then the installation is saved and existing repos are matched to GitHub.
//   repos    { teamId } → { repos: [{ githubRepoId, owner, name, private }] }
//     Repos the group's installations can reach (owners/admins only).
//   add_repo { teamId, githubRepoId } → { repo }
//     Adds (or connects) that repo in the group (owners/admins only), after
//     checking one of the group's installations can reach it.
//
// Errors: 400 bad_request / state_invalid · 401 unauthorized · 403 forbidden /
// installation_denied · 404 repo_not_found · 502 github_error · 503 not_configured
//
// Secrets (set with `supabase secrets set`, never in the repo):
//   GITHUB_APP_ID         the App's ID (or its Client ID)
//   GITHUB_APP_PRIVATE_KEY the App's private key, converted to PKCS#8 PEM
//   GITHUB_CLIENT_ID      the App's Client ID (OAuth)
//   GITHUB_CLIENT_SECRET  an OAuth client secret generated for the App

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { importPKCS8, SignJWT } from 'npm:jose@6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const STATE_MAX_AGE_MS = 30 * 60_000
const REPO_COLUMNS = 'id, team_id, owner, name, created_at, github_repo_id, installation_id'

type GitHubRepo = { id: number; name: string; private: boolean; owner: { login: string } }
type GitHubInstallation = { id: number; account: { login: string; type: string } | null }

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0

// ------------------------------------------------------------------ GitHub

async function github<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'DevDock',
      ...init.headers,
    },
  })
  if (!res.ok) {
    console.error(`[github] ${init.method ?? 'GET'} ${path} → ${res.status}`, await res.text())
    throw new HttpError(502, 'github_error')
  }
  return (await res.json()) as T
}

type AppConfig = { appId: string; privateKey: string; clientId: string; clientSecret: string }

function appConfig(): AppConfig | null {
  const appId = Deno.env.get('GITHUB_APP_ID')
  // `supabase secrets set` may store the PEM's newlines as literal "\n".
  const privateKey = Deno.env.get('GITHUB_APP_PRIVATE_KEY')?.replace(/\\n/g, '\n')
  const clientId = Deno.env.get('GITHUB_CLIENT_ID')
  const clientSecret = Deno.env.get('GITHUB_CLIENT_SECRET')
  return appId && privateKey && clientId && clientSecret ? { appId, privateKey, clientId, clientSecret } : null
}

/** A 9-minute JWT that authenticates as the App itself. */
async function appJwt(config: AppConfig) {
  let key: CryptoKey
  try {
    key = await importPKCS8(config.privateKey, 'RS256')
  } catch (error) {
    console.error('[github] GITHUB_APP_PRIVATE_KEY must be a PKCS#8 PEM ("BEGIN PRIVATE KEY")', error)
    throw new HttpError(503, 'not_configured')
  }
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(config.appId)
    .setIssuedAt(now - 60) // GitHub allows for clock drift this way
    .setExpirationTime(now + 9 * 60)
    .sign(key)
}

/** A short-lived token acting as the App on one installation (its granted repos only). */
async function installationToken(config: AppConfig, installationId: number) {
  const { token } = await github<{ token: string }>(
    `/app/installations/${installationId}/access_tokens`,
    await appJwt(config),
    { method: 'POST' },
  )
  return token
}

async function installationRepos(token: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = []
  for (let page = 1; page <= 20; page++) {
    const data = await github<{ repositories: GitHubRepo[] }>(`/installation/repositories?per_page=100&page=${page}`, token)
    repos.push(...data.repositories)
    if (data.repositories.length < 100) break
  }
  return repos
}

/** Exchanges the one-time OAuth code from the install redirect for the person's GitHub token. */
async function userToken(config: AppConfig, code: string) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'DevDock' },
    body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code }),
  })
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string }
  if (!res.ok || !body.access_token) {
    console.error('[github] OAuth code exchange failed', res.status, body.error)
    throw new HttpError(400, 'state_invalid')
  }
  return body.access_token
}

async function userInstallations(token: string): Promise<GitHubInstallation[]> {
  const all: GitHubInstallation[] = []
  for (let page = 1; page <= 10; page++) {
    const data = await github<{ installations: GitHubInstallation[] }>(`/user/installations?per_page=100&page=${page}`, token)
    all.push(...data.installations)
    if (data.installations.length < 100) break
  }
  return all
}

// ---------------------------------------------------------------- database

async function requireAdmin(admin: SupabaseClient, teamId: string, userId: string) {
  const { data, error } = await admin
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[github] role lookup failed', error)
    throw new HttpError(500, 'server_error')
  }
  if (data?.role !== 'owner' && data?.role !== 'admin') throw new HttpError(403, 'forbidden')
}

async function teamInstallationIds(admin: SupabaseClient, teamId: string): Promise<number[]> {
  const { data, error } = await admin.from('github_installations').select('installation_id').eq('team_id', teamId)
  if (error) {
    console.error('[github] installations lookup failed', error)
    throw new HttpError(500, 'server_error')
  }
  return data.map((r: { installation_id: number }) => r.installation_id)
}

type RepoRow = { id: string; owner: string; name: string; github_repo_id: number | null; installation_id: number | null }

/**
 * Records a GitHub repo in the group: the row already carrying its GitHub id,
 * else a row added by the same name before connecting, else a new row.
 */
async function upsertRepo(admin: SupabaseClient, teamId: string, installationId: number, repo: GitHubRepo, userId?: string) {
  const { data: rows, error } = await admin
    .from('repos')
    .select('id, owner, name, github_repo_id, installation_id')
    .eq('team_id', teamId)
  if (error) throw new HttpError(500, 'server_error')
  const lower = (s: string) => s.toLowerCase()
  const existing =
    (rows as RepoRow[]).find((r) => r.github_repo_id === repo.id) ??
    (rows as RepoRow[]).find(
      (r) => r.github_repo_id === null && lower(r.owner) === lower(repo.owner.login) && lower(r.name) === lower(repo.name),
    )
  const fields = { owner: repo.owner.login, name: repo.name, github_repo_id: repo.id, installation_id: installationId }
  const query = existing
    ? admin.from('repos').update(fields).eq('id', existing.id)
    : admin.from('repos').insert({ ...fields, team_id: teamId, created_by: userId ?? null })
  const { data, error: writeError } = await query.select(REPO_COLUMNS).single()
  if (writeError) {
    console.error('[github] saving repo failed', writeError)
    throw new HttpError(500, 'server_error')
  }
  return data
}

// ----------------------------------------------------------------- actions

async function connect(admin: SupabaseClient, config: AppConfig, userId: string, body: Record<string, unknown>) {
  const { state, code, installationId } = body
  if (!isUuid(state) || typeof code !== 'string' || !code || !isId(installationId)) throw new HttpError(400, 'bad_request')

  // One use only, whatever happens next.
  const { data: saved, error } = await admin
    .from('github_connect_states')
    .delete()
    .eq('state', state)
    .select('team_id, user_id, created_at')
    .maybeSingle()
  if (error) throw new HttpError(500, 'server_error')
  if (!saved || saved.user_id !== userId || Date.now() - Date.parse(saved.created_at) > STATE_MAX_AGE_MS) {
    throw new HttpError(400, 'state_invalid')
  }
  const teamId: string = saved.team_id
  await requireAdmin(admin, teamId, userId)

  const installation = (await userInstallations(await userToken(config, code))).find((i) => i.id === installationId)
  if (!installation?.account) throw new HttpError(403, 'installation_denied')
  const accountType = installation.account.type === 'Organization' ? 'Organization' : 'User'

  const { error: saveError } = await admin.from('github_installations').upsert({
    team_id: teamId,
    installation_id: installationId,
    account_login: installation.account.login,
    account_type: accountType,
    connected_by: userId,
  })
  if (saveError) {
    console.error('[github] saving installation failed', saveError)
    throw new HttpError(500, 'server_error')
  }

  // Connect repos the group already has (by GitHub id, or by name for ones typed in earlier).
  const { data: existing } = await admin.from('repos').select('owner, name, github_repo_id').eq('team_id', teamId)
  const rows = (existing ?? []) as RepoRow[]
  const known = (r: GitHubRepo) =>
    rows.some(
      (row) =>
        row.github_repo_id === r.id ||
        (row.owner.toLowerCase() === r.owner.login.toLowerCase() && row.name.toLowerCase() === r.name.toLowerCase()),
    )
  const reachable = await installationRepos(await installationToken(config, installationId))
  for (const repo of reachable.filter(known)) {
    await upsertRepo(admin, teamId, installationId, repo).catch((e) => console.error('[github] matching repo failed', e))
  }

  const { data: team } = await admin.from('teams').select('slug').eq('id', teamId).single()
  return { teamSlug: team?.slug as string, account: installation.account.login }
}

async function listRepos(admin: SupabaseClient, config: AppConfig, userId: string, body: Record<string, unknown>) {
  const { teamId } = body
  if (!isUuid(teamId)) throw new HttpError(400, 'bad_request')
  await requireAdmin(admin, teamId, userId)
  const repos: { githubRepoId: number; owner: string; name: string; private: boolean }[] = []
  for (const installationId of await teamInstallationIds(admin, teamId)) {
    for (const r of await installationRepos(await installationToken(config, installationId))) {
      if (!repos.some((x) => x.githubRepoId === r.id)) {
        repos.push({ githubRepoId: r.id, owner: r.owner.login, name: r.name, private: r.private })
      }
    }
  }
  repos.sort((a, b) => `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`, undefined, { sensitivity: 'base' }))
  return { repos }
}

async function addRepo(admin: SupabaseClient, config: AppConfig, userId: string, body: Record<string, unknown>) {
  const { teamId, githubRepoId } = body
  if (!isUuid(teamId) || !isId(githubRepoId)) throw new HttpError(400, 'bad_request')
  await requireAdmin(admin, teamId, userId)
  // Only a repo one of the group's installations was granted. (Not GET
  // /repositories/:id: installation tokens can read any public repo.)
  for (const installationId of await teamInstallationIds(admin, teamId)) {
    const granted = await installationRepos(await installationToken(config, installationId))
    const repo = granted.find((r) => r.id === githubRepoId)
    if (repo) return { repo: await upsertRepo(admin, teamId, installationId, repo, userId) }
  }
  throw new HttpError(404, 'repo_not_found')
}

// ------------------------------------------------------------------ server

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const config = appConfig()
  if (!config) return json({ error: 'not_configured' }, 503)

  const accessToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!accessToken) return json({ error: 'unauthorized' }, 401)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await caller.auth.getUser(accessToken)
  if (userError || !userData.user) return json({ error: 'unauthorized' }, 401)
  const userId = userData.user.id

  // Writes that clients may not make (installations, GitHub ids) go through
  // the service role, after the checks in each action.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    switch (body.action) {
      case 'connect':
        return json(await connect(admin, config, userId, body))
      case 'repos':
        return json(await listRepos(admin, config, userId, body))
      case 'add_repo':
        return json(await addRepo(admin, config, userId, body))
      default:
        return json({ error: 'bad_request' }, 400)
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.code }, error.status)
    console.error('[github] unexpected error', error)
    return json({ error: 'server_error' }, 500)
  }
})
