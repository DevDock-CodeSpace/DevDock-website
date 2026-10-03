import { useQueryClient } from '@tanstack/react-query'
import type { JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { ArrowLeft, ArrowRight, Check, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { OthersTypingAlert } from '@/components/OthersTypingAlert'
import { Button } from '@/components/ui/button'
import { adoptContent } from '@/features/docs/editor/adopt'
import { docExtensions } from '@/features/docs/editor/extensions'
import { FormatBubble } from '@/features/docs/editor/FormatBubble'
import { InsertMenu } from '@/features/docs/editor/InsertMenu'
import { docContentClass } from '@/features/docs/editor/styles'
import { useCurrentTeam } from '@/features/teams/hooks'
import { learningPath, lessonPath } from '@/features/teams/nav'
import { useOthersTyping } from '@/hooks/use-others-typing'
import { AUTOSAVE_MS, useSaveOnExit } from '@/hooks/use-save-on-exit'
import { errorMessage } from '@/lib/errors'
import { sameJson } from '@/lib/json'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database.types'
import { learningKeys, updateLesson, type Lesson } from '../api'
import { useLearning, useToggleDone } from '../hooks'

function initialContent(body: Json | null): JSONContent | null {
  if (body && typeof body === 'object' && !Array.isArray(body) && body.type === 'doc') return body as JSONContent
  return null
}

/**
 * A lesson: the Docs editor for managers (autosaved; no images) or the same
 * rendering read-only for everyone else, then "Mark as done" and
 * previous/next lesson in reading order.
 */
export default function LessonView({ lesson }: { lesson: Lesson }) {
  const { team } = useCurrentTeam()
  const { workspace, outline, ordered, done, canManage } = useLearning()
  const toggle = useToggleDone()
  const queryClient = useQueryClient()
  const module = outline.find((m) => m.id === lesson.module_id)
  const moduleIndex = outline.findIndex((m) => m.id === lesson.module_id)
  const lessonIndex = module?.lessons.findIndex((l) => l.id === lesson.id) ?? -1
  const position = ordered.findIndex((l) => l.id === lesson.id)
  const previous = ordered[position - 1]
  const next = ordered[position + 1]
  const isDone = done.has(lesson.id)

  // ------------------------------------------------------------ saving (managers)
  // Saves run one after another (an older one can't land on top of a newer one), and
  // the cached lesson gets the text as soon as a save starts, so coming back shows it.
  const [status, setStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved')
  const pending = useRef<{ title?: string; body?: Json | null }>({})
  const timer = useRef<number | undefined>(undefined)
  const saving = useRef(false)
  const inflight = useRef<Promise<void>>(Promise.resolve())
  const mounted = useRef(true)
  // What the server has, as far as this view knows (the last load, save, or adopted change).
  const synced = useRef<{ title: string; body: Json | null }>({ title: lesson.title, body: lesson.body })
  const setCached = useCallback(
    (patch: { title?: string; body?: Json | null }) =>
      queryClient.setQueryData<Lesson | null>(learningKeys.lesson(lesson.id), (old) => (old ? { ...old, ...patch } : old)),
    [lesson.id, queryClient],
  )
  const save = useCallback(async () => {
    const patch = pending.current
    if (Object.keys(patch).length === 0) return
    pending.current = {}
    saving.current = true
    setStatus('saving')
    try {
      await updateLesson(lesson.id, patch)
      const saved = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() }
      synced.current = { ...synced.current, ...saved }
      // A refetch that started before this save still carries the old text: drop it.
      void queryClient.cancelQueries({ queryKey: learningKeys.lesson(lesson.id), exact: true })
      setCached(saved)
      setStatus(Object.keys(pending.current).length === 0 ? 'saved' : 'pending')
      if (patch.title !== undefined) void queryClient.invalidateQueries({ queryKey: learningKeys.lessons(workspace.id) })
    } catch (error) {
      // Keep the text for the next attempt (the next edit, or leaving the lesson).
      pending.current = { ...patch, ...pending.current }
      // Nobody is left to retry: the cache goes back to what the server has.
      if (!mounted.current) setCached(synced.current)
      setStatus('error')
      toast.error(errorMessage(error), { id: 'lesson-save' })
    } finally {
      saving.current = false
    }
  }, [lesson.id, queryClient, setCached, workspace.id])
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const patch = pending.current
    if (Object.keys(patch).length === 0) return
    setCached(patch.title === undefined ? patch : { ...patch, title: patch.title.trim() })
    inflight.current = inflight.current.then(save)
  }, [save, setCached])
  const { others, markTyping } = useOthersTyping(`lesson:${lesson.id}`, canManage)
  const queue = (patch: { title?: string; body?: Json | null }) => {
    pending.current = { ...pending.current, ...patch }
    markTyping()
    setStatus('pending')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, AUTOSAVE_MS)
  }
  // Send any unsaved change when leaving the lesson.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      flush()
    }
  }, [flush])
  useSaveOnExit(() => Object.keys(pending.current).length > 0 || saving.current, flush)

  // ------------------------------------------------------------ title
  const [title, setTitle] = useState(lesson.title)
  const titleField = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = titleField.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [title])

  // ------------------------------------------------------------ editor
  const extensions = useMemo(
    () =>
      docExtensions({
        editable: canManage,
        placeholder: 'Write the lesson… (press + for headings, lists, code)',
      }),
    [canManage],
  )
  const editor = useEditor({
    extensions,
    content: initialContent(lesson.body),
    editable: canManage,
    immediatelyRender: true,
    editorProps: {
      attributes: { class: cn(docContentClass, 'min-h-40'), 'aria-label': 'Lesson content' },
    },
    onUpdate: ({ editor }) => queue({ body: editor.isEmpty ? null : (editor.getJSON() as Json) }),
  })

  // A lesson that changed on the server (the instructor editing it, another tab)
  // replaces what's shown here, unless there are unsaved edits.
  useEffect(() => {
    if (Object.keys(pending.current).length > 0 || saving.current) return
    const sameBody = sameJson(lesson.body, synced.current.body)
    if (sameBody && lesson.title === synced.current.title) return
    synced.current = { title: lesson.title, body: lesson.body }
    setTitle(lesson.title)
    if (!sameBody && editor) adoptContent(editor, lesson.body)
  }, [lesson.title, lesson.body, editor])

  return (
    <div className="max-w-[760px]">
      <div className="mb-6 flex items-center justify-between gap-3">
        <nav aria-label="Lesson path" className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <Link to={learningPath(team.slug, workspace.id)} className="inline-flex shrink-0 items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Learning
          </Link>
          {module && (
            <>
              <ChevronRight className="size-3 shrink-0" />
              <span className="truncate">
                {moduleIndex + 1}. {module.title}
              </span>
              <ChevronRight className="size-3 shrink-0" />
              <span className="shrink-0 font-mono">
                {moduleIndex + 1}.{lessonIndex + 1}
              </span>
            </>
          )}
        </nav>
        {canManage && (
          <span aria-live="polite" className={cn('text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
            {{ saved: 'Saved', pending: 'Editing…', saving: 'Saving…', error: 'Not saved' }[status]}
          </span>
        )}
      </div>

      {canManage ? (
        <textarea
          ref={titleField}
          value={title}
          rows={1}
          maxLength={200}
          aria-label="Lesson title"
          placeholder="Lesson title"
          onChange={(e) => {
            const next = e.target.value.replace(/\n/g, ' ')
            setTitle(next)
            if (next.trim()) queue({ title: next })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              editor?.commands.focus('start')
            }
          }}
          className="mb-6 block w-full resize-none overflow-hidden bg-transparent text-3xl leading-tight font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
        />
      ) : (
        <h1 className="mb-6 text-3xl leading-tight font-bold tracking-tight">{lesson.title}</h1>
      )}

      <OthersTypingAlert names={others} />
      {editor && canManage && (
        <>
          <FormatBubble editor={editor} />
          <InsertMenu editor={editor} />
        </>
      )}
      {!canManage && !lesson.body ? (
        <p className="text-sm text-muted-foreground">This lesson doesn’t have any content yet.</p>
      ) : (
        <div className="-ml-8 pl-8">
          <EditorContent editor={editor} />
        </div>
      )}

      <div className="mt-12 flex flex-col gap-4 border-t pt-6">
        <Button
          size="lg"
          variant={isDone ? 'secondary' : 'default'}
          className="self-start"
          aria-pressed={isDone}
          onClick={() => toggle.mutate({ lessonId: lesson.id, done: !isDone })}
        >
          <Check /> {isDone ? 'Done. Mark as not done' : 'Mark as done'}
        </Button>
        <div className="grid grid-cols-2 gap-3">
          {previous ? (
            <Link
              to={lessonPath(team.slug, workspace.id, previous.id)}
              className="group rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowLeft className="size-3" /> Previous
              </span>
              <span className="mt-1 block truncate font-medium">{previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              to={lessonPath(team.slug, workspace.id, next.id)}
              onClick={() => {
                // Finishing a lesson by moving on marks it done, like most course sites.
                if (!isDone) toggle.mutate({ lessonId: lesson.id, done: true })
              }}
              className="group rounded-lg border p-3 text-right text-sm transition-colors hover:bg-muted/50"
            >
              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                {isDone ? 'Next' : 'Done, next lesson'} <ArrowRight className="size-3" />
              </span>
              <span className="mt-1 block truncate font-medium">{next.title}</span>
            </Link>
          ) : (
            <Link
              to={learningPath(team.slug, workspace.id)}
              className="rounded-lg border p-3 text-right text-sm transition-colors hover:bg-muted/50"
            >
              <span className="text-xs text-muted-foreground">Last lesson</span>
              <span className="mt-1 block font-medium">Back to the course</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
