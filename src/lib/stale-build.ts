// After a deploy, a tab that was already open still runs the old build. When
// it lazy-loads a page (doc editor, diagrams, an issue), the old chunk's file
// name no longer exists, so the import fails. Reloading picks up the new build.

const RELOADED_AT = 'devdock:reloaded-for-new-version'
const MIN_GAP_MS = 60_000

/** "Failed to fetch dynamically imported module" (Chrome), "Importing a module script failed" (Safari), "error loading dynamically imported module" (Firefox). */
export function isStaleBuildError(error: unknown) {
  return (
    error instanceof Error &&
    /dynamically imported module|importing a module script failed|module script/i.test(error.message)
  )
}

/**
 * Reloads once to load the new build. Returns false (and does nothing) if we
 * already reloaded for this within the last minute, so a real outage can't
 * turn into a reload loop.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) ?? 0)
    if (Date.now() - last < MIN_GAP_MS) return false
    sessionStorage.setItem(RELOADED_AT, String(Date.now()))
  } catch {
    // No sessionStorage (some private modes): we couldn't tell a second failure from
    // the first, so don't auto-reload; the error screen offers a Reload button instead.
    return false
  }
  window.location.reload()
  return true
}

/**
 * Vite fires `vite:preloadError` when a lazy chunk fails to load: reload right
 * away. The error isn't cancelled (that would hand the page an empty module),
 * so the route error screen shows "DevDock was just updated" until the reload lands.
 */
export function watchForStaleBuild() {
  window.addEventListener('vite:preloadError', () => {
    reloadForNewVersion()
  })
}
