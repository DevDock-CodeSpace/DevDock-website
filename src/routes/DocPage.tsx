import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, LoaderCircle, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import { deleteDocument, documentQuery, updateDocument, type Doc } from '@/features/docs/api'
import { DocScope } from '@/features/docs/components/DocScope'
import { useCanWriteDocs } from '@/features/docs/hooks'
import { useCurrentTeam } from '@/features/teams/hooks'
import { docsPath } from '@/features/teams/nav'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * One doc, at /t/:teamSlug/docs/:docId (team view) or …/w/:workspaceId/docs/:docId
 * (inside the workspace, under its tabs). docLoader has already checked it exists,
 * belongs to this team, and (in a workspace) to that workspace.
 */
export function DocPage() {
  const { docId = '' } = useParams()
  const doc = useSuspenseQuery(documentQuery(docId)).data
  if (!doc) {
    return <p className="py-16 text-center text-sm text-muted-foreground">This doc doesn’t exist anymore.</p>
  }
  return <DocEditor key={doc.id} doc={doc} />
}

function DocEditor({ doc }: { doc: Doc }) {
  const { workspaceId } = useParams()
  const { team } = useCurrentTeam()
  const canWrite = useCanWriteDocs()(doc.workspace_id)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [now] = useState(Date.now)
  const [title, setTitle] = useState(doc.title)
  const [content, setContent] = useState(doc.content)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Set once we're deliberately leaving (after delete), so the unsaved-changes guard stays out of the way.
  const leaving = useRef(false)
  const backTo = docsPath(team.slug, workspaceId)
  const dirty = canWrite && (title.trim() !== doc.title || content !== doc.content)

  const save = useMutation({
    mutationFn: () => updateDocument(doc.id, { title, content }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents'] }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => deleteDocument(doc.id),
    onSuccess: async () => {
      toast.success(`${doc.title} was deleted`)
      // Leave the page before dropping its data (see useExitTeam for why).
      leaving.current = true
      await navigate(backTo, { replace: true })
      queryClient.removeQueries({ queryKey: ['documents', doc.id] })
      await queryClient.invalidateQueries({ queryKey: ['documents'] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const trySave = () => {
    if (dirty && title.trim() && !save.isPending) save.mutate()
  }

  // Leaving with unsaved edits: in-app navigation asks first; closing/reloading the tab warns.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      trySave()
    }
  }

  return (
    <div className="max-w-3xl" onKeyDown={onKeyDown}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
          <Link to={backTo} className="inline-flex shrink-0 items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" /> Docs
          </Link>
          {/* In a workspace the scope is obvious from the tabs above. */}
          {!workspaceId && (
            <>
              <span aria-hidden>·</span>
              <DocScope doc={doc} />
            </>
          )}
        </div>
        {canWrite && (
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn('text-xs', dirty ? 'text-foreground' : 'text-muted-foreground')} aria-live="polite">
              {save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <Button size="sm" onClick={trySave} disabled={!dirty || !title.trim() || save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              Save
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete doc"
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
          placeholder="Untitled"
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
        />
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
      )}

      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <PersonAvatar profile={doc.author} className="size-5" />
        <span>{doc.author?.display_name ?? 'Former member'}</span>
        <span aria-hidden>·</span>
        <span className="font-mono">updated {timeAgo(doc.updated_at, now)}</span>
        {!canWrite && (
          <>
            <span aria-hidden>·</span>
            <span>read-only</span>
          </>
        )}
      </p>

      <div className="mt-5 border-t pt-5">
        {canWrite ? (
          <textarea
            value={content}
            aria-label="Content"
            placeholder="Start writing…"
            maxLength={200000}
            onChange={(e) => setContent(e.target.value)}
            className="field-sizing-content min-h-[50vh] w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
        ) : doc.content ? (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{doc.content}</div>
        ) : (
          <p className="text-sm text-muted-foreground">This doc is empty.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${doc.title}?`}
        description="This can’t be undone."
        confirmLabel="Delete doc"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.state === 'blocked' && blocker.reset()}
        title="Discard unsaved changes?"
        description="Your edits to this doc haven’t been saved."
        confirmLabel="Discard"
        onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
      />
    </div>
  )
}
