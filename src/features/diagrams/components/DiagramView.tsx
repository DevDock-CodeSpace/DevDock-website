import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { DocScope } from '@/features/docs/components/DocScope'
import { useCurrentTeam } from '@/features/teams/hooks'
import { diagramsPath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Json } from '@/types/database.types'
import { deleteDiagram, diagramQuery, updateDiagram, type Diagram } from '../api'
import { DiagramEditor } from '../editor/DiagramEditor'
import { parse } from '../editor/model'

const AUTOSAVE_MS = 1000
const MIN_CANVAS_HEIGHT = 480

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

/**
 * The diagram page body (lazy-loaded with React Flow): title bar + editor.
 * Writers' changes autosave; leaving flushes the save first. Everyone else
 * gets the same canvas read-only.
 */
export default function DiagramView({ diagram, canWrite }: { diagram: Diagram; canWrite: boolean }) {
  const { workspaceId } = useParams()
  const { team } = useCurrentTeam()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [now] = useState(Date.now)
  const backTo = diagramsPath(team.slug, workspaceId)
  const [initial] = useState(() => parse(diagram.data))

  // ------------------------------------------------------------ autosave
  const [title, setTitle] = useState(diagram.title)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const titleRef = useRef(diagram.title)
  const dataRef = useRef<Json>(diagram.data)
  const version = useRef(0) // bumped on every edit
  const savedVersion = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const inflight = useRef<Promise<void>>(Promise.resolve())
  const leaving = useRef(false)

  const save = useCallback(async () => {
    const target = version.current
    if (target === savedVersion.current) return
    const nextTitle = titleRef.current.trim()
    if (!nextTitle) {
      setStatus('error')
      throw new Error('Add a title to save this diagram.')
    }
    setStatus('saving')
    const data = dataRef.current
    try {
      await updateDiagram(diagram.id, { title: nextTitle, data })
    } catch (error) {
      setStatus('error')
      throw error
    }
    savedVersion.current = target
    queryClient.setQueryData(diagramQuery(diagram.id).queryKey, (old) =>
      old ? { ...old, title: nextTitle, data, updated_at: new Date().toISOString() } : old,
    )
    void queryClient.invalidateQueries({ queryKey: ['diagrams', 'team'] })
    void queryClient.invalidateQueries({ queryKey: ['diagrams', 'workspace'] })
    setStatus(version.current === target ? 'saved' : 'pending')
  }, [diagram.id, queryClient])

  /** Save now (after any save already running). Rejects if it fails. */
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const run = inflight.current.catch(() => {}).then(save)
    inflight.current = run
    return run
  }, [save])

  const markChanged = useCallback(() => {
    version.current += 1
    setStatus('pending')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      flush().catch((error: unknown) => toast.error(errorMessage(error), { id: 'diagram-save' }))
    }, AUTOSAVE_MS)
  }, [flush])

  const onChange = useCallback(
    (data: Json) => {
      if (!canWrite) return
      dataRef.current = data
      markChanged()
    },
    [canWrite, markChanged],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    if (!canWrite) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        flush().catch((error: unknown) => toast.error(errorMessage(error), { id: 'diagram-save' }))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canWrite, flush])

  // ---------------------------------------------------- leaving the page
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      canWrite &&
      !leaving.current &&
      version.current !== savedVersion.current &&
      currentLocation.pathname !== nextLocation.pathname,
  )
  const [saveFailedOnLeave, setSaveFailedOnLeave] = useState(false)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    flush()
      .then(() => blocker.proceed())
      .catch(() => setSaveFailedOnLeave(true))
  }, [blocker, flush])

  useEffect(() => {
    if (status === 'saved') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  // --------------------------------------------------------------- delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = async () => {
    setDeleting(true)
    try {
      window.clearTimeout(timer.current)
      await deleteDiagram(diagram.id)
      toast.success(`${diagram.title} was deleted`)
      // Leave the page before dropping its data (see useExitTeam for why).
      leaving.current = true
      await navigate(backTo, { replace: true })
      queryClient.removeQueries({ queryKey: ['diagrams', diagram.id] })
      await queryClient.invalidateQueries({ queryKey: ['diagrams'] })
    } catch (error) {
      toast.error(errorMessage(error))
      setDeleting(false)
    }
  }

  // ------------------------------------------------ canvas size / full screen
  // The canvas fills the rest of the window below the page header.
  const frame = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(MIN_CANVAS_HEIGHT)
  const [fullscreen, setFullscreen] = useState(false)
  useLayoutEffect(() => {
    const fit = () => {
      // Page offset (not viewport), minus the layout's bottom padding.
      const top = (frame.current?.getBoundingClientRect().top ?? 0) + window.scrollY
      setHeight(Math.max(MIN_CANVAS_HEIGHT, window.innerHeight - top - 32))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  useEffect(() => {
    if (!fullscreen) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key === 'Escape' && !target?.closest('input, textarea, [contenteditable]')) setFullscreen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreen])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          <Link to={backTo} className="inline-flex shrink-0 items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Diagrams
          </Link>
          {/* In a workspace the scope is obvious from the tabs above. */}
          {!workspaceId && (
            <>
              <span aria-hidden>·</span>
              <DocScope doc={diagram} />
            </>
          )}
          <span aria-hidden>·</span>
          <span className="truncate">
            {diagram.author?.display_name ?? 'Former member'} · Updated {timeAgo(diagram.updated_at, now)}
          </span>
          {!canWrite && (
            <>
              <span aria-hidden>·</span>
              <span className="shrink-0">View only</span>
            </>
          )}
        </div>
        {canWrite && (
          <div className="flex shrink-0 items-center gap-2">
            <SaveIndicator status={status} />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete diagram"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      {canWrite ? (
        <input
          value={title}
          maxLength={200}
          aria-label="Title"
          placeholder="Untitled diagram"
          onChange={(e) => {
            setTitle(e.target.value)
            titleRef.current = e.target.value
            markChanged()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="mb-4 block w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
        />
      ) : (
        <h1 className="mb-4 truncate text-2xl font-semibold tracking-tight">{diagram.title}</h1>
      )}

      <div
        ref={frame}
        style={fullscreen ? undefined : { height }}
        className={cn(
          'overflow-hidden bg-background',
          fullscreen ? 'fixed inset-0 z-50' : 'rounded-lg border',
        )}
      >
        <DiagramEditor
          initial={initial}
          readOnly={!canWrite}
          onChange={onChange}
          fullscreen={fullscreen}
          onFullscreen={setFullscreen}
        />
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${diagram.title}?`}
        description="This can’t be undone."
        confirmLabel="Delete diagram"
        pending={deleting}
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        open={saveFailedOnLeave}
        onOpenChange={(open) => {
          if (open) return
          setSaveFailedOnLeave(false)
          if (blocker.state === 'blocked') blocker.reset()
        }}
        title="Couldn’t save your latest changes"
        description="If you leave now, your most recent edits will be lost."
        confirmLabel="Leave anyway"
        onConfirm={() => {
          setSaveFailedOnLeave(false)
          if (blocker.state === 'blocked') blocker.proceed()
        }}
      />
    </div>
  )
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label = { saved: 'Saved', pending: 'Editing…', saving: 'Saving…', error: 'Not saved' }[status]
  return (
    <span
      aria-live="polite"
      className={cn('text-xs', status === 'error' ? 'text-destructive' : 'text-muted-foreground')}
    >
      {label}
    </span>
  )
}
