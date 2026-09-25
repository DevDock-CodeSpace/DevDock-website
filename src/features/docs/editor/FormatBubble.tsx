import { NodeSelection } from '@tiptap/pm/state'
import { useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Link2,
  List,
  SquareCheck,
  Strikethrough,
  Unlink,
  type LucideIcon,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { cn } from '@/lib/utils'

/**
 * Dropbox Paper-style selection toolbar: inverted colors, icon buttons grouped
 * as marks | blocks | code. Link editing swaps the buttons for an inline input.
 */
export function FormatBubble({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false)
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bulletList: e.isActive('bulletList'),
      taskList: e.isActive('taskList'),
      code: e.isActive('code'),
      href: (e.getAttributes('link').href as string | undefined) ?? '',
    }),
  })

  const chain = () => editor.chain().focus()

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 10 }}
      shouldShow={({ editor: e, state }) =>
        e.isEditable &&
        !state.selection.empty &&
        !(state.selection instanceof NodeSelection) &&
        !e.isActive('codeBlock')
      }
      className="z-20 flex items-center gap-0.5 rounded-md bg-foreground p-1 text-background shadow-xl"
    >
      {linking ? (
        <LinkInput
          initial={active.href}
          onDone={(href) => {
            setLinking(false)
            if (href === null) return void editor.commands.focus()
            if (href === '') return void chain().extendMarkRange('link').unsetLink().run()
            chain().extendMarkRange('link').setLink({ href }).run()
          }}
        />
      ) : (
        <>
          <ToolButton icon={Bold} label="Bold" active={active.bold} onClick={() => chain().toggleBold().run()} />
          <ToolButton
            icon={Strikethrough}
            label="Strikethrough"
            active={active.strike}
            onClick={() => chain().toggleStrike().run()}
          />
          <ToolButton
            icon={Highlighter}
            label="Highlight"
            active={active.highlight}
            onClick={() => chain().toggleHighlight().run()}
          />
          <ToolButton icon={Link2} label="Link" active={active.link} onClick={() => setLinking(true)} />
          <Divider />
          <ToolButton
            icon={Heading1}
            label="Heading 1"
            active={active.h1}
            onClick={() => chain().toggleHeading({ level: 1 }).run()}
          />
          <ToolButton
            icon={Heading2}
            label="Heading 2"
            active={active.h2}
            onClick={() => chain().toggleHeading({ level: 2 }).run()}
          />
          <ToolButton
            icon={Heading3}
            label="Heading 3"
            active={active.h3}
            onClick={() => chain().toggleHeading({ level: 3 }).run()}
          />
          <ToolButton
            icon={List}
            label="Bulleted list"
            active={active.bulletList}
            onClick={() => chain().toggleBulletList().run()}
          />
          <ToolButton
            icon={SquareCheck}
            label="Checklist"
            active={active.taskList}
            onClick={() => chain().toggleTaskList().run()}
          />
          <Divider />
          <ToolButton icon={Code} label="Inline code" active={active.code} onClick={() => chain().toggleCode().run()} />
        </>
      )}
    </BubbleMenu>
  )
}

function ToolButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // Keep the text selection while clicking.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded transition-colors hover:bg-background/15',
        active && 'bg-background/20 text-brand',
      )}
    >
      <Icon className="size-[18px]" strokeWidth={2.25} />
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-background/25" aria-hidden />
}

/** Inline link field. onDone: string = set (empty = remove), null = cancel. */
function LinkInput({ initial, onDone }: { initial: string; onDone: (href: string | null) => void }) {
  const [value, setValue] = useState(initial)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const href = value.trim()
    // Only web and mail links; anything else (e.g. javascript:) becomes a harmless https:// URL.
    onDone(href === '' || /^(https?:\/\/|mailto:)/i.test(href) ? href : `https://${href}`)
  }
  return (
    <form onSubmit={submit} className="flex items-center gap-1 pl-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone(null)}
        placeholder="Paste or type a link"
        aria-label="Link URL"
        className="h-8 w-64 bg-transparent px-1 text-sm outline-none placeholder:text-background/50"
      />
      {initial && (
        <button
          type="button"
          aria-label="Remove link"
          title="Remove link"
          onClick={() => onDone('')}
          className="flex size-8 items-center justify-center rounded hover:bg-background/15"
        >
          <Unlink className="size-4" />
        </button>
      )}
    </form>
  )
}
