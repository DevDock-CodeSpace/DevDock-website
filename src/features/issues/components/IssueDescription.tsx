import { useQueryClient } from '@tanstack/react-query'
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { docExtensions } from '@/features/docs/editor/extensions'
import { FormatBubble } from '@/features/docs/editor/FormatBubble'
import { InsertMenu } from '@/features/docs/editor/InsertMenu'
import { docContentClass } from '@/features/docs/editor/styles'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database.types'
import { issueKeys, updateIssue, type IssueDetail } from '../api'

const AUTOSAVE_MS = 800

function initialContent(body: Json | null): JSONContent | null {
  if (body && typeof body === 'object' && !Array.isArray(body) && body.type === 'doc') return body as JSONContent
  return null
}

/**
 * The issue description: the Docs editor (headings, lists, checklists, code,
 * formatting toolbar, "+" menu) without images. Autosaves; a pending save is
 * sent when the page closes the issue.
 */
export function IssueDescription({ issue }: { issue: IssueDetail }) {
  const queryClient = useQueryClient()
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<Json | null | undefined>(undefined)

  const save = useMemo(
    () => async () => {
      const description = pending.current
      if (description === undefined) return
      pending.current = undefined
      try {
        await updateIssue(issue.id, { description })
        queryClient.setQueryData<IssueDetail | null>(issueKeys.detail(issue.workspace_id, issue.number), (old) =>
          old ? { ...old, description } : old,
        )
      } catch (error) {
        toast.error(errorMessage(error), { id: 'issue-description' })
      }
    },
    [issue.id, issue.workspace_id, issue.number, queryClient],
  )

  // Send any unsaved change when leaving the issue.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      void save()
    },
    [save],
  )

  const extensions = useMemo(
    () => docExtensions({ editable: true, placeholder: 'Add a description… (press + for headings, lists, code)' }),
    [],
  )
  const editor = useEditor({
    extensions,
    content: initialContent(issue.description),
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: cn(docContentClass, 'min-h-24 text-[15px] leading-[1.65]'),
        'aria-label': 'Issue description',
      },
    },
    onUpdate: ({ editor }) => {
      pending.current = editor.isEmpty ? null : (editor.getJSON() as Json)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS)
    },
  })

  return (
    // Left gutter for the "+" button.
    <div className="-ml-8 pl-8">
      {editor && (
        <>
          <FormatBubble editor={editor} />
          <InsertMenu editor={editor} />
        </>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
