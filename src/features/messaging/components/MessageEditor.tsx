import { EditorContent, useEditor } from '@tiptap/react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Json } from '@/types/database.types'
import { messageEditorClass, messageExtensions } from '../editor'

/** Edits one sent message in place; Enter saves, Escape cancels. */
export function MessageEditor({ body, saving, onSave, onCancel }: { body: Json; saving: boolean; onSave: (content: string, body: Json) => void; onCancel: () => void }) {
  const editor = useEditor({
    extensions: messageExtensions('Edit message'),
    content: body as Record<string, unknown>,
    autofocus: 'end',
    editorProps: {
      attributes: { class: messageEditorClass, 'aria-label': 'Edit message' },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          onCancel()
          return true
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          save()
          return true
        }
        return false
      },
    },
  })
  const save = () => {
    if (!editor || saving) return
    const content = editor.getText({ blockSeparator: '\n' }).trim()
    if (content) onSave(content, editor.getJSON() as Json)
  }
  return (
    <div className="space-y-2">
      <EditorContent editor={editor} />
      <div className="flex items-center gap-2">
        <Button size="xs" onClick={save} disabled={saving}>{saving && <LoaderCircle className="animate-spin" />}Save</Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
        <span className="text-xs text-muted-foreground">Ctrl/⌘+Enter to save, Esc to cancel</span>
      </div>
    </div>
  )
}
