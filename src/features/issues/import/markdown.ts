import type { JSONContent } from '@tiptap/core'
import { getSchema } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import type { ImportSource } from './fields'

// Descriptions in the file → the issue editor's JSON. Loaded only with the import page.
// The nodes and marks have the editor's names (docs/editor/extensions.ts), without what only
// editing needs: CodeBlockLowlight saves the same `codeBlock` with a `language`, so the plain
// code block reads the same and keeps highlight.js out of this chunk.
const extensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { autolink: false, defaultProtocol: 'https' } }),
  Highlight,
  TaskList,
  TaskItem.configure({ nested: true }),
]
const schema = getSchema(extensions)
const markdown = new MarkdownManager({ extensions })

const BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'codeBlock', 'blockquote', 'horizontalRule'])

/**
 * What the editor can't show: images become links (its image node holds only files stored in
 * DevDock, and the export's links need the other tool's sign-in), and tables become code blocks
 * so their text survives (there is no table node).
 */
function prepare(text: string): string {
  const imagesAsLinks = text.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, alt: string, url: string) => `[${alt.trim() || 'Image'}](${url})`)
  return imagesAsLinks.replace(/(^|\n)((?:[ \t]*\|.*\|[ \t]*(?:\n|$)){2,})/g, (_m, start: string, table: string) => `${start}\`\`\`\n${table.replace(/\n$/, '')}\n\`\`\`\n`)
}

/** Inline content left at the top level goes into paragraphs; headings deeper than H3 become H3. */
function tidy(doc: JSONContent): JSONContent {
  const content: JSONContent[] = []
  let loose: JSONContent[] = []
  const flush = () => {
    if (loose.length) content.push({ type: 'paragraph', content: loose })
    loose = []
  }
  for (const node of doc.content ?? []) {
    if (!BLOCKS.has(node.type ?? '')) {
      loose.push(node)
      continue
    }
    flush()
    content.push(node.type === 'heading' ? { ...node, attrs: { ...node.attrs, level: Math.min(3, Number(node.attrs?.level) || 1) } } : node)
  }
  flush()
  return { type: 'doc', content }
}

/** Text as paragraphs: blank lines split them, single line breaks are kept. */
export function plainTextDoc(text: string): JSONContent {
  return {
    type: 'doc',
    content: text
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => ({
        type: 'paragraph',
        content: block.split('\n').flatMap((line, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : [])]),
      })),
  }
}

/**
 * Linear and Notion write Markdown; Jira writes its own wiki markup, which reads better as plain
 * text than as Markdown gone wrong. Anything the schema refuses falls back to plain text too.
 */
export function descriptionDoc(text: string, source: ImportSource): JSONContent | null {
  if (!text.trim()) return null
  if (source !== 'jira') {
    try {
      const doc = tidy(markdown.parse(prepare(text)))
      schema.nodeFromJSON(doc).check()
      if (doc.content?.length) return doc
    } catch (error) {
      console.warn('[import] Description kept as plain text', error)
    }
  }
  return plainTextDoc(text)
}
