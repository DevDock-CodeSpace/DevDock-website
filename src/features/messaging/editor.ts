import { Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'
import type { Json } from '@/types/database.types'

/** What a message may contain (matches the architecture doc): paragraphs, bold/italic/code, lists, code blocks, links. */
export function messageExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      horizontalRule: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', protocols: ['http', 'https', 'mailto'] },
    }),
    Placeholder.configure({ placeholder }),
  ]
}

export const messageEditorClass = [
  'min-h-10 max-h-48 overflow-y-auto rounded-md border bg-background px-3 py-2 text-sm outline-none',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
  '[&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]',
  '[&_pre]:my-1 [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:font-mono [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2',
  '[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0',
  '[&_.is-empty]:before:text-muted-foreground/60 [&_.is-empty]:before:content-[attr(data-placeholder)]',
].join(' ')

export const emptyDoc = { type: 'doc', content: [{ type: 'paragraph' }] } satisfies Json

/** A message body for plain text (thread replies are typed in a single-line box). */
export const textDoc = (text: string): Json => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

/** Parses a saved draft; anything unexpected becomes an empty draft. */
export function parseDraft(raw: string | null): Json | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'doc' ? (value as Json) : undefined
  } catch {
    return undefined
  }
}

/** The composer's text area: no border of its own (the box around it has one). */
export const composerEditorClass = [
  'max-h-48 min-h-[2.75rem] overflow-y-auto px-3 py-2.5 text-sm outline-none',
  '[&_p]:my-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em]',
  '[&_pre]:my-1 [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:font-mono [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2',
  '[&_.is-empty]:before:pointer-events-none [&_.is-empty]:before:float-left [&_.is-empty]:before:h-0',
  '[&_.is-empty]:before:text-muted-foreground/60 [&_.is-empty]:before:content-[attr(data-placeholder)]',
].join(' ')
