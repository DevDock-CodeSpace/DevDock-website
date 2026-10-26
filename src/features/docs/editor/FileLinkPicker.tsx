import { useQuery } from '@tanstack/react-query'
import type { Editor } from '@tiptap/react'
import { FileText, Presentation } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { teamDocsQuery } from '@/features/docs/api'
import { DocScope } from '@/features/docs/components/DocScope'
import { useCurrentTeam } from '@/features/teams/hooks'
import { cn } from '@/lib/utils'
import type { FileLinkKind } from './FileLink'

/** `[[` then up to 60 characters of search, right before the cursor (a link chip counts as a stop). */
const TRIGGER = /\[\[([^[\]\n￼]{0,60})$/
const MAX_RESULTS = 8

type Open = { query: string; from: number; to: number; left: number; top: number }

/** Where a typed `[[query` is, or null. Not inside code, and only while editing. */
function triggerAt(editor: Editor): Open | null {
  const { $from, empty } = editor.state.selection
  if (!empty || !editor.isEditable || $from.parent.type.spec.code) return null
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 80), $from.parentOffset, undefined, '￼')
  const match = TRIGGER.exec(before)
  if (!match) return null
  const from = $from.pos - match[0].length
  const coords = editor.view.coordsAtPos(from)
  return { query: match[1], from, to: $from.pos, left: coords.left, top: coords.bottom }
}

/**
 * The `[[` picker: type `[[` and a few letters of a doc or diagram's title, pick one (↑ ↓ Enter, or
 * click), and it becomes a link chip. Lists everything in the group you can open, from the same
 * cached lists the links and Files use; nothing is fetched until it opens. Esc closes it until the
 * `[[` is typed again.
 */
export function FileLinkPicker({ editor, excludeId }: { editor: Editor; excludeId?: string }) {
  const { team } = useCurrentTeam()
  const [open, setOpen] = useState<Open | null>(null)
  const [active, setActive] = useState(0)
  /** The `[[` dismissed with Esc (by position), so it doesn't reopen while typing after it. */
  const dismissed = useRef<number | null>(null)
  const lastQuery = useRef<string | null>(null)

  useEffect(() => {
    const update = () => {
      let next = triggerAt(editor)
      if (next && dismissed.current === next.from) next = null
      else if (!next) dismissed.current = null
      // A new search starts at the top of the list.
      if ((next?.query ?? null) !== lastQuery.current) setActive(0)
      lastQuery.current = next?.query ?? null
      setOpen(next)
    }
    const close = () => setOpen(null)
    editor.on('transaction', update)
    editor.on('blur', close)
    return () => {
      editor.off('transaction', update)
      editor.off('blur', close)
    }
  }, [editor])

  const docs = useQuery({ ...teamDocsQuery(team.id), enabled: open !== null })
  const diagrams = useQuery({ ...teamDiagramsQuery(team.id), enabled: open !== null })
  const results = useMemo(() => {
    if (!open) return []
    const query = open.query.trim().toLowerCase()
    return [
      ...(docs.data ?? []).map((item) => ({ kind: 'doc' as FileLinkKind, item })),
      ...(diagrams.data ?? []).map((item) => ({ kind: 'diagram' as FileLinkKind, item })),
    ]
      .filter(({ item }) => item.id !== excludeId && item.title.toLowerCase().includes(query))
      .sort((a, b) => b.item.updated_at.localeCompare(a.item.updated_at))
      .slice(0, MAX_RESULTS)
  }, [open, docs.data, diagrams.data, excludeId])
  const loading = open !== null && (docs.isPending || diagrams.isPending)

  const choose = (index: number) => {
    const picked = results[index]
    if (!open || !picked) return
    editor.chain().focus().insertFileLink({ kind: picked.kind, id: picked.item.id }, { from: open.from, to: open.to }).run()
    setOpen(null)
  }

  // While open, ↑ ↓ Enter Tab Esc belong to the list: caught on the window before the editor sees them.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      let handled = true
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1
        if (results.length > 0) setActive((i) => (i + step + results.length) % results.length)
      } else if ((event.key === 'Enter' || event.key === 'Tab') && results.length > 0) {
        choose(Math.min(active, results.length - 1))
      } else if ((event.key === 'Enter' || event.key === 'Tab') && loading) {
        // Still loading: Enter waits for the list instead of breaking the line.
      } else if (event.key === 'Escape') {
        dismissed.current = open.from
        setOpen(null)
      } else {
        handled = false
      }
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!open) return null
  return createPortal(
    <div
      role="listbox"
      aria-label="Link a doc or whiteboard"
      className="fixed z-50 w-80 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
      style={{ left: Math.min(open.left, window.innerWidth - 336), top: open.top + 6 }}
    >
      <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
        Link a doc or diagram{open.query ? <> matching “{open.query}”</> : null}
      </p>
      {loading ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
      ) : results.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-muted-foreground">No docs or whiteboards match.</p>
      ) : (
        results.map(({ kind, item }, index) => {
          const Icon = kind === 'diagram' ? Presentation : FileText
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left', index === active && 'bg-accent')}
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
              <span className="max-w-28 shrink-0">
                <DocScope doc={item} />
              </span>
            </button>
          )
        })
      )}
    </div>,
    document.body,
  )
}
