import type { Editor } from '@tiptap/react'
import { FloatingMenu } from '@tiptap/react/menus'
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  SquareCheck,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type Item = { label: string; hint?: string; icon: LucideIcon; run: (editor: Editor) => void }

const items: Item[] = [
  { label: 'Heading 1', hint: '#', icon: Heading1, run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { label: 'Heading 2', hint: '##', icon: Heading2, run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { label: 'Heading 3', hint: '###', icon: Heading3, run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { label: 'Bulleted list', hint: '-', icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
  { label: 'Numbered list', hint: '1.', icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run() },
  { label: 'Checklist', hint: '[ ]', icon: SquareCheck, run: (e) => e.chain().focus().toggleTaskList().run() },
  { label: 'Code block', hint: '```', icon: Code2, run: (e) => e.chain().focus().setCodeBlock().run() },
  { label: 'Quote', hint: '>', icon: Quote, run: (e) => e.chain().focus().setBlockquote().run() },
  { label: 'Divider', hint: '---', icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
]

/**
 * Paper-style "+" on an empty line: opens a list of blocks to insert.
 * A plain popover (not a Radix menu) so the editor keeps focus and the
 * floating menu stays anchored to the line.
 */
/** `onPickImage` omitted = no Image item (e.g. issue descriptions). */
export function InsertMenu({ editor, onPickImage }: { editor: Editor; onPickImage?: () => void }) {
  const [open, setOpen] = useState(false)

  // Moving the cursor elsewhere closes the menu (the "+" follows the empty line).
  useEffect(() => {
    const close = () => setOpen(false)
    editor.on('selectionUpdate', close)
    editor.on('blur', close)
    return () => {
      editor.off('selectionUpdate', close)
      editor.off('blur', close)
    }
  }, [editor])

  const choose = (run: (editor: Editor) => void) => {
    setOpen(false)
    run(editor)
  }

  return (
    <FloatingMenu
      editor={editor}
      options={{ placement: 'left-start', offset: 10 }}
      shouldShow={({ editor: e, state }) => {
        const { $from, empty } = state.selection
        const onEmptyLine = empty && $from.depth === 1 && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0
        return e.isEditable && e.isFocused && onEmptyLine
      }}
      className="z-20"
    >
      <div className="relative" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
        <button
          type="button"
          aria-label="Insert block"
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex size-6 items-center justify-center rounded-full border text-muted-foreground transition hover:border-foreground/40 hover:text-foreground',
            open && 'rotate-45 border-foreground/40 text-foreground',
          )}
        >
          <Plus className="size-3.5" />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute top-8 left-0 w-60 rounded-lg border bg-popover p-1 text-popover-foreground shadow-xl"
          >
            {items.map((item) => (
              <MenuItem key={item.label} item={item} onChoose={() => choose(item.run)} />
            ))}
            {onPickImage && (
              <>
                <div className="my-1 h-px bg-border" />
                <MenuItem
                  item={{ label: 'Image', hint: 'paste / drop', icon: ImagePlus, run: onPickImage }}
                  onChoose={() => {
                    setOpen(false)
                    onPickImage()
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </FloatingMenu>
  )
}

function MenuItem({ item, onChoose }: { item: Item; onChoose: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
    >
      <item.icon className="size-4 text-muted-foreground" />
      <span className="flex-1">{item.label}</span>
      {item.hint && <span className="font-mono text-[11px] text-muted-foreground">{item.hint}</span>}
    </button>
  )
}
