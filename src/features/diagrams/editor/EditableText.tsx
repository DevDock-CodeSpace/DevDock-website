import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type EditableTextProps = {
  value: string
  onDone: (value: string | null) => void
  className?: string
}

/**
 * In-place text editing for shapes and connectors. Enter saves (Shift+Enter
 * for a new line), Escape cancels, clicking away saves. `onDone(null)` = cancelled.
 */
export function EditableText({ value, onDone, className }: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  // The element owns the text while editing; it starts from the value at mount.
  const start = useRef(value)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.textContent = start.current
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [])

  const finish = (next: string | null) => {
    if (done.current) return
    done.current = true
    onDone(next)
  }

  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      className={cn(
        'nodrag nopan nowheel min-w-[1ch] cursor-text whitespace-pre-wrap break-words outline-none',
        className,
      )}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          finish(ref.current?.innerText.replace(/\n$/, '') ?? value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(null)
        }
      }}
      onBlur={() => finish(ref.current?.innerText.replace(/\n$/, '') ?? value)}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  )
}
