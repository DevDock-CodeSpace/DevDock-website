import { useState } from 'react'

/**
 * Whether the details panel is open: always closed when a page opens, and not remembered
 * (owner's choice, 2026-10-27: the list comes first; the panel button opens it for this visit).
 */
export function usePanelOpen() {
  return useState(false)
}
