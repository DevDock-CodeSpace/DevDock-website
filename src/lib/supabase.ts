import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Browser client. Uses the *publishable* key only; access control is enforced
// by Postgres Row Level Security, not by keeping this key secret.
//
// Importing this module requires VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example). Nothing imports it yet, so
// the mock-data UI runs without credentials.

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).',
  )
}

if (isPrivilegedKey(publishableKey)) {
  throw new Error(
    'VITE_SUPABASE_PUBLISHABLE_KEY holds a secret/service-role key. Use the publishable key; secret keys must never ship to the browser.',
  )
}

export const supabase = createClient<Database>(url, publishableKey)

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
