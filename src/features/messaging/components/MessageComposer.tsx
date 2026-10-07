import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { Bold, Code, Italic, List, ListOrdered, Paperclip, Send, SquareCode, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import type { TeamMember } from '@/features/teams/api'
import type { Json } from '@/types/database.types'
import { composerEditorClass, emptyDoc, messageExtensions, parseDraft } from '../editor'
import type { SendInput } from '../hooks'
import { ResourceAttachmentMenu, type ResourceLink } from './ResourceAttachmentMenu'

type Props = {
  /** Keys the saved draft (a conversation id, or `thread:<id>`). */
  draftId: string
  teamId: string
  teamSlug: string
  placeholder: string
  /** Thread replies: no formatting hint under the box. */
  compact?: boolean
  currentUserId: string
  /** People in this conversation (the only ones who can be mentioned). */
  participants: TeamMember[]
  /** Called with what to send and a function that puts it back if the send fails. */
  onSend: (input: Omit<SendInput, 'clientId'>, restore: () => void) => void
  onTyping: () => void
}

const draftKey = (draftId: string) => `devdock-message-draft:${draftId}`
const mentionToken = (text: string) => text.match(/(?:^|\s)@([^\s@]*)$/)

export function MessageComposer({ draftId, teamId, teamSlug, placeholder, compact = false, currentUserId, participants, onSend, onTyping }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [mentions, setMentions] = useState<TeamMember[]>([])
  const [query, setQuery] = useState<string | null>(null)
  const [empty, setEmpty] = useState(true)
  const submitRef = useRef<() => void>(() => {})

  const editor = useEditor({
    extensions: messageExtensions(placeholder),
    content: (() => {
      try {
        return (parseDraft(window.sessionStorage.getItem(draftKey(draftId))) ?? emptyDoc) as Record<string, unknown>
      } catch {
        return emptyDoc as Record<string, unknown>
      }
    })(),
    editorProps: {
      attributes: { class: composerEditorClass, 'aria-label': placeholder },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return false
        // Inside a list or code block Enter makes a new line; Ctrl/⌘+Enter always sends.
        const { $from } = view.state.selection
        const inBlock = $from.node(-1)?.type.name === 'listItem' || $from.parent.type.name === 'codeBlock'
        if (inBlock && !(event.metaKey || event.ctrlKey)) return false
        event.preventDefault()
        submitRef.current()
        return true
      },
    },
    onUpdate: ({ editor: current }) => {
      setEmpty(current.getText().trim() === '')
      onTyping()
      try {
        window.sessionStorage.setItem(draftKey(draftId), JSON.stringify(current.getJSON()))
      } catch {
        // A full or blocked sessionStorage only loses the draft.
      }
      const { $from } = current.state.selection
      const match = mentionToken($from.parent.textBetween(0, $from.parentOffset, undefined, '￼'))
      setQuery(match ? match[1].toLowerCase() : null)
    },
  })

  // The toolbar follows the cursor (the editor doesn't re-render React on every transaction).
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      code: current?.isActive('code') ?? false,
      bulletList: current?.isActive('bulletList') ?? false,
      orderedList: current?.isActive('orderedList') ?? false,
      codeBlock: current?.isActive('codeBlock') ?? false,
    }),
  })

  const submit = () => {
    if (!editor) return
    const content = editor.getText({ blockSeparator: '\n' }).trim()
    if (!content && files.length === 0) return
    const body = editor.getJSON() as Json
    const sent = { content: content || 'Shared files', body, files, mentionIds: mentions.filter((person) => content.includes(`@${person.profile?.display_name ?? 'member'}`)).map((person) => person.user_id) }
    editor.commands.clearContent(true)
    setFiles([])
    setMentions([])
    setQuery(null)
    try {
      window.sessionStorage.removeItem(draftKey(draftId))
    } catch {
      // Nothing saved to remove.
    }
    onSend(sent, () => {
      editor.commands.setContent(sent.body as Record<string, unknown>, { emitUpdate: true })
      setFiles(sent.files)
      setMentions(participants.filter((person) => sent.mentionIds.includes(person.user_id)))
    })
  }
  useEffect(() => {
    submitRef.current = submit
  })

  const candidates = query === null ? [] : participants.filter((person) => person.user_id !== currentUserId && (person.profile?.display_name ?? 'member').toLowerCase().includes(query))
  const chooseMention = (person: TeamMember) => {
    if (!editor || query === null) return
    const at = editor.state.selection.from
    editor.chain().focus().deleteRange({ from: at - query.length - 1, to: at }).insertContent(`@${person.profile?.display_name ?? 'member'} `).run()
    setMentions((current) => (current.some((item) => item.user_id === person.user_id) ? current : [...current, person]))
    setQuery(null)
  }
  const insertLinks = (links: ResourceLink[]) => {
    if (!editor) return
    const content = links.flatMap((link, index) => [
      ...(index > 0 ? [{ type: 'hardBreak' }] : []),
      { type: 'text', text: link.label, marks: [{ type: 'link', attrs: { href: `${window.location.origin}${link.href}` } }] },
    ])
    editor.chain().focus().insertContent([...content, { type: 'text', text: ' ' }]).run()
  }

  const tool = (label: string, icon: React.ReactNode, active: boolean | undefined, run: () => void) => (
    <Button type="button" variant={active ? 'secondary' : 'ghost'} size="icon-xs" className="size-7 text-muted-foreground" aria-label={label} title={label} aria-pressed={active} onMouseDown={(event) => event.preventDefault()} onClick={run}>{icon}</Button>
  )

  return (
    <form onSubmit={(event) => { event.preventDefault(); submit() }} className={compact ? 'mt-2' : 'px-4 pt-1 pb-3'}>
      <div className="relative">
        {candidates.length > 0 && (
          <div className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-64 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md" role="listbox" aria-label="Mention someone">
            {candidates.map((person) => (
              <button key={person.user_id} type="button" role="option" aria-selected={false} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseMention(person)}>
                <PersonAvatar profile={person.profile} className="size-5" />
                <span className="truncate">{person.profile?.display_name ?? 'Unnamed member'}</span>
              </button>
            ))}
          </div>
        )}
        <div className="rounded-lg border bg-background transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b px-2.5 py-2">
              {files.map((file) => (
                <span key={`${file.name}-${file.size}`} className="flex max-w-56 items-center gap-1.5 rounded-md border bg-muted/50 py-1 pr-1 pl-2 text-xs">
                  <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{file.name}</span>
                  <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((item) => item !== file))}><X className="size-3" /></button>
                </span>
              ))}
            </div>
          )}
          <EditorContent editor={editor} />
          <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
            {editor && (
              <>
                {tool('Bold', <Bold />, active.bold, () => editor.chain().focus().toggleBold().run())}
                {tool('Italic', <Italic />, active.italic, () => editor.chain().focus().toggleItalic().run())}
                {tool('Inline code', <Code />, active.code, () => editor.chain().focus().toggleCode().run())}
                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                {tool('Bulleted list', <List />, active.bulletList, () => editor.chain().focus().toggleBulletList().run())}
                {tool('Numbered list', <ListOrdered />, active.orderedList, () => editor.chain().focus().toggleOrderedList().run())}
                {tool('Code block', <SquareCode />, active.codeBlock, () => editor.chain().focus().toggleCodeBlock().run())}
              </>
            )}
            <div className="ml-auto flex items-center gap-1">
              <ResourceAttachmentMenu teamId={teamId} teamSlug={teamSlug} onFiles={setFiles} onLinks={insertLinks} />
              <Button type="submit" size="icon-sm" aria-label="Send message" disabled={empty && files.length === 0}>
                <Send />
              </Button>
            </div>
          </div>
        </div>
      </div>
      {!compact && <p className="mt-1 hidden px-1 text-[11px] text-muted-foreground sm:block">Enter to send · Shift+Enter for a new line</p>}
    </form>
  )
}
