import type { Json } from '@/types/database.types'

// A plan's description is stored like an issue's (TipTap JSON in a jsonb column), so a rich editor
// can take it over later. For now the page edits it as plain text: paragraphs, line breaks kept.

type Node = { type?: string; text?: string; content?: Node[] }

/** The text of a stored description: paragraphs separated by blank lines. */
export function descriptionText(doc: Json | null): string {
  const walk = (node: Node): string => {
    if (node.type === 'text') return node.text ?? ''
    if (node.type === 'hardBreak') return '\n'
    const inner = (node.content ?? []).map(walk).join('')
    return node.type === 'doc' ? (node.content ?? []).map(walk).join('\n\n') : inner
  }
  return doc && typeof doc === 'object' && !Array.isArray(doc) ? walk(doc as Node).trim() : ''
}

/** Plain text → a document of paragraphs (null when empty). */
export function descriptionDoc(text: string): Json | null {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  if (blocks.length === 0) return null
  return {
    type: 'doc',
    content: blocks.map((block) => ({
      type: 'paragraph',
      content: block.split('\n').flatMap((line, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : [])]),
    })),
  }
}
