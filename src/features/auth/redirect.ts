// Where to send the user after sign-in. Only same-origin app paths are allowed,
// so a crafted ?next= can't turn DevDock into an open redirect.

const NEXT_KEY = 'devdock:auth-next'
export const DEFAULT_AFTER_LOGIN = '/app'

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return DEFAULT_AFTER_LOGIN
  }
  if (value.startsWith('/login') || value.startsWith('/auth/')) return DEFAULT_AFTER_LOGIN
  return value
}

/** Survives the round trip to Google (same tab), so redirectTo can stay a fixed URL. */
export function rememberNextPath(next: string) {
  try {
    sessionStorage.setItem(NEXT_KEY, safeNextPath(next))
  } catch {
    // Storage blocked: the user lands on the default page instead.
  }
}

export function takeNextPath(): string {
  try {
    const next = sessionStorage.getItem(NEXT_KEY)
    sessionStorage.removeItem(NEXT_KEY)
    return safeNextPath(next)
  } catch {
    return DEFAULT_AFTER_LOGIN
  }
}
