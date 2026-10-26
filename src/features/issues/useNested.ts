import { useState } from 'react'

const STORAGE_KEY = 'devdock-issue-nested'

function readPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Storage can be blocked; flat by default.
    return false
  }
}

/** Whether lists nest sub-issues under their parents: remembered per browser, one choice for every issue page. */
export function useNested() {
  const [nested, setNested] = useState(readPreference)
  const set = (next: boolean) => {
    setNested(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // Not remembered, still works for this visit.
    }
  }
  return [nested, set] as const
}
