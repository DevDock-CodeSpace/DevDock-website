import { createClient, isAuthApiError } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { authStorage } from './auth-storage'

// Browser client. Uses the *publishable* key only; access control is enforced
// by Postgres Row Level Security, not by keeping this key secret.
//
// Requires VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example).
// Only import this from feature api.ts modules, never from components.

const envUrl = import.meta.env.VITE_SUPABASE_URL
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!envUrl || !envKey) {
  throw new Error(
    'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env or .env.local (see .env.example).',
  )
}

if (isPrivilegedKey(envKey)) {
  throw new Error(
    'VITE_SUPABASE_PUBLISHABLE_KEY holds a secret/service-role key. Use the publishable key; secret keys must never ship to the browser.',
  )
}

export const supabaseUrl: string = envUrl
export const supabasePublishableKey: string = envKey

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    // PKCE: the OAuth redirect carries a one-time code instead of tokens in the
    // URL. detectSessionInUrl (on by default) exchanges it automatically.
    flowType: 'pkce',
    // This tab only (sessionStorage), or every tab and across restarts when
    // "Remember me" was ticked (localStorage). See lib/auth-storage.
    storage: {
      getItem: (key) => authStorage().getItem(key),
      setItem: (key, value) => authStorage().setItem(key, value),
      removeItem: (key) => authStorage().removeItem(key),
    },
  },
  global: { fetch: fetchRenewingRefusedToken },
})

// A stored access token can be refused while the client still thinks it's good (a laptop waking
// from sleep, another tab renewing the session): every request then fails with 401 and the page
// shows "Something went wrong" until a reload. So when the database API refuses a signed-in
// request, renew the session once (shared by everything that failed at the same moment) and retry
// with the new token. If the server won't renew it either, this browser signs out and
// watchAuthIdentity sends the person to the login page.
let renewing: Promise<string | null> | null = null

function renewedAccessToken(): Promise<string | null> {
  renewing ??= supabase.auth
    .refreshSession()
    .then(async ({ data, error }) => {
      // The server refused to renew it (revoked, signed out elsewhere): sign this browser out, so
      // watchAuthIdentity sends the person to the login page instead of an error screen. Not when
      // the network failed: the session may still be good.
      if (isAuthApiError(error)) await supabase.auth.signOut({ scope: 'local' })
      return data.session?.access_token ?? null
    })
    .catch(() => null)
    .finally(() => setTimeout(() => (renewing = null), 0))
  return renewing
}

async function fetchRenewingRefusedToken(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  if (response.status !== 401) return response
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith(`${supabaseUrl}/rest/v1/`)) return response
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  // Only a signed-in request (a user's JWT; the publishable key isn't one) can be fixed by renewing.
  if (!headers.get('Authorization')?.startsWith('Bearer ey')) return response
  const token = await renewedAccessToken()
  if (!token) return response
  console.warn('[auth] The server refused the session token; renewed it and retried.')
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

/** Catches the two ways a server-only key could be pasted here by mistake. */
function isPrivilegedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true
  // Legacy keys are JWTs; the service_role one says so in its payload.
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof claims === 'object' && claims !== null && 'role' in claims && claims.role === 'service_role'
  } catch {
    return false
  }
}
