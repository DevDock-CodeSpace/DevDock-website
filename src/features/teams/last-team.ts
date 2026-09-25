// Remembers which team /app should open. Convenience only.
const KEY = 'devdock:last-team'

export function rememberTeam(slug: string) {
  try {
    localStorage.setItem(KEY, slug)
  } catch {
    // Storage unavailable: /app just opens the first team.
  }
}

export function lastTeam(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
