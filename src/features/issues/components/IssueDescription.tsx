import { useQueryClient } from '@tanstack/react-query'
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { OthersTypingAlert } from '@/components/OthersTypingAlert'
import { adoptContent } from '@/features/docs/editor/adopt'
import { docExtensions } from '@/features/docs/editor/extensions'
import { FormatBubble } from '@/features/docs/editor/FormatBubble'
import { InsertMenu } from '@/features/docs/editor/InsertMenu'
import { docContentClass } from '@/features/docs/editor/styles'
import { useOthersTyping } from '@/hooks/use-others-typing'
import { AUTOSAVE_MS, useSaveOnExit } from '@/hooks/use-save-on-exit'
import { errorMessage } from '@/lib/errors'
import { sameJson } from '@/lib/json'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database.types'
import { issueKeys, updateIssue, type IssueDetail } from '../api'

function initialContent(body: Json | null): JSONContent | null {
  if (body && typeof body === 'object' && !Array.isArray(body) && body.type === 'doc') return body as JSONContent
  return null
}

/**
 * The issue description: the Docs editor (headings, lists, checklists, code,
 * formatting toolbar, "+" menu) without images. Saves itself like Linear:
 * while typing, when leaving the issue, and when the tab is hidden or closed.
 * The cached issue gets the text as soon as a save starts, so reopening the
 * issue shows it even before the server has answered.
 */
export function IssueDescription({ issue }: { issue: IssueDetail }) {
  const queryClient = useQueryClient()
  const { others, markTyping } = useOthersTyping(`issue:${issue.id}`, true)
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<Json | null | undefined>(undefined) // edited, not sent yet
  const saving = useRef(false)
  const inflight = useRef<Promise<void>>(Promise.resolve())
  const saved = useRef(issue.description) // what the server has, as far as we know
  const mounted = useRef(true)

  const detailKey = useMemo(() => issueKeys.detail(issue.workspace_id, issue.number), [issue.workspace_id, issue.number])
  const setCached = useCallback(
    (description: Json | null) =>
      queryClient.setQueryData<IssueDetail | null>(detailKey, (old) => (old ? { ...old, description } : old)),
    [detailKey, queryClient],
  )

  const save = useCallback(async () => {
    const description = pending.current
    if (description === undefined) return
    pending.current = undefined
    saving.current = true
    try {
      await updateIssue(issue.id, { description })
      saved.current = description
      // A refetch that started before this save still carries the old text: drop it and ask again.
      void queryClient.cancelQueries({ queryKey: detailKey })
      setCached(description)
      void queryClient.invalidateQueries({ queryKey: detailKey })
    } catch (error) {
      // Keep the text for the next attempt (the next edit, or leaving the issue).
      if (pending.current === undefined) pending.current = description
      // Nobody is left to retry: the cache goes back to what the server has.
      if (!mounted.current) setCached(saved.current)
      toast.error(errorMessage(error), { id: 'issue-description' })
    } finally {
      saving.current = false
    }
  }, [issue.id, detailKey, setCached, queryClient])

  /** Save now. Saves run one after another, so an older one can't land on top of a newer one. */
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    if (pending.current === undefined) return
    setCached(pending.current)
    inflight.current = inflight.current.then(save)
  }, [save, setCached])

  // Send any unsaved change when leaving the issue.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      flush()
    }
  }, [flush])
  useSaveOnExit(() => pending.current !== undefined || saving.current, flush)

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
      markTyping()
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(flush, AUTOSAVE_MS)
    },
  })

  // A description that changed on the server (someone else, another tab) replaces
  // the text here, unless there are unsaved edits.
  useEffect(() => {
    if (!editor) return
    if (pending.current !== undefined || saving.current) return
    if (sameJson(issue.description, saved.current)) return
    saved.current = issue.description
    adoptContent(editor, issue.description)
  }, [editor, issue.description])

  return (
    // Left gutter for the "+" button.
    <div className="-ml-8 pl-8">
      {editor && (
        <>
          <FormatBubble editor={editor} />
          <InsertMenu editor={editor} />
        </>
      )}
      <OthersTypingAlert names={others} />
      <EditorContent editor={editor} />
    </div>
  )
}
