import { useCallback, useRef, useState } from 'react'
import type { DiagramContent } from './model'

const LIMIT = 100

/**
 * Undo/redo as whole-diagram snapshots. React Flow updates nodes/edges
 * immutably, so a snapshot is just the current arrays (no deep copy).
 * Call `snapshot()` *before* a change; `undo()` swaps back.
 */
export function useHistory(get: () => DiagramContent, set: (content: DiagramContent) => void) {
  const past = useRef<DiagramContent[]>([])
  const future = useRef<DiagramContent[]>([])
  const [counts, setCounts] = useState({ past: 0, future: 0 })
  const sync = () => setCounts({ past: past.current.length, future: future.current.length })

  const snapshot = useCallback(() => {
    past.current.push(get())
    if (past.current.length > LIMIT) past.current.shift()
    future.current = []
    sync()
  }, [get])

  const undo = useCallback(() => {
    const previous = past.current.pop()
    if (!previous) return
    future.current.push(get())
    set(previous)
    sync()
  }, [get, set])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(get())
    set(next)
    sync()
  }, [get, set])

  return { snapshot, undo, redo, canUndo: counts.past > 0, canRedo: counts.future > 0 }
}
