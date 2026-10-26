import { useState } from 'react'

const STORAGE_KEY = 'devdock:chat-collapsed'

function readCollapsed(): string[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
  } catch {
    // Storage can be blocked; every section starts open.
    return []
  }
}

/**
 * Which Chat list sections (channel / dm / group) are closed: remembered per browser,
 * so a closed section stays closed across visits and sign-ins until it is opened again.
 */
export function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = (section: string) => {
    const next = collapsed.includes(section) ? collapsed.filter((item) => item !== section) : [...collapsed, section]
    setCollapsed(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Not remembered, still works for this visit.
    }
  }
  return { isCollapsed: (section: string) => collapsed.includes(section), toggle }
}
