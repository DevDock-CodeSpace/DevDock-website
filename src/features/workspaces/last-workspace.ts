// Remembers which workspace /app should open. Convenience only.
const KEY = 'devdock:last-workspace'

export function rememberWorkspace(slug: string) {
  try {
    localStorage.setItem(KEY, slug)
  } catch {
    // Storage unavailable: /app just opens the first workspace.
  }
}

export function lastWorkspace(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
