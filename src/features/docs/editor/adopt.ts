import type { Editor, JSONContent } from '@tiptap/core'
import { sameJson } from '@/lib/json'
import type { Json } from '@/types/database.types'

const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

/**
 * Shows a newer saved version in an open editor (live updates). Only call it
 * when the editor has no unsaved edits. It isn't reported as an edit, can't be
 * undone back to the old text, and leaves the cursor where it was when possible.
 * Works on an editor that isn't on screen yet (a lesson that had no content).
 */
export function adoptContent(editor: Editor, body: Json | null) {
  // Already showing it (our own save coming back): leave the editor alone.
  if (body === null ? editor.isEmpty : sameJson(editor.getJSON() as Json, body)) return
  const valid = body && typeof body === 'object' && !Array.isArray(body) && body.type === 'doc'
  const { from, to } = editor.state.selection
  editor
    .chain()
    .setMeta('addToHistory', false)
    .setContent(valid ? (body as JSONContent) : EMPTY, { emitUpdate: false })
    .setTextSelection({ from, to })
    .run()
}
