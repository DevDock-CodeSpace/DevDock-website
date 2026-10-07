import { useState } from 'react'

const STORAGE_KEY = 'devdock-issue-panel'

function readPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === '1'
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  // Open by default where there is room beside the list.
  return window.innerWidth >= 1280
}

/** Whether the details panel is open: remembered per browser, one choice for every issue page. */
export function usePanelOpen() {
  const [open, setOpen] = useState(readPreference)
  const set = (next: boolean) => {
    setOpen(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Not remembered, still works for this visit.
    }
  }
  return [open, set] as const
}
