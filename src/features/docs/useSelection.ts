import { useMemo, useRef, useState } from 'react'

type Modifiers = { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }

/**
 * Multi-select for a list, like a file manager: Ctrl/⌘-click toggles, Shift-click selects a range from
 * the last one clicked, a checkbox toggles. `keys` are the rows in display order; anything that is no
 * longer in the list drops out of the selection by itself (opening a folder, deleting, moving).
 */
export function useSelection(keys: string[]) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  const selected = useMemo(() => new Set(keys.filter((key) => chosen.has(key))), [keys, chosen])

  const toggle = (key: string) => {
    anchor.current = key
    setChosen(() => {
      const next = new Set(selected)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const only = (key: string) => {
    anchor.current = key
    setChosen(new Set([key]))
  }
  const range = (key: string) => {
    const from = anchor.current !== null && keys.includes(anchor.current) ? keys.indexOf(anchor.current) : keys.indexOf(key)
    const to = keys.indexOf(key)
    setChosen(new Set(keys.slice(Math.min(from, to), Math.max(from, to) + 1)))
  }
  const all = () => setChosen(new Set(keys))
  const clear = () => {
    anchor.current = null
    setChosen(new Set())
  }

  return {
    selected,
    count: selected.size,
    has: (key: string) => selected.has(key),
    toggle,
    only,
    range,
    all,
    clear,
    /** Handles a click with a modifier key; returns true when it did (so the row shouldn't open). */
    click(key: string, event: Modifiers) {
      if (event.shiftKey) range(key)
      else if (event.metaKey || event.ctrlKey) toggle(key)
      else return false
      return true
    },
  }
}
