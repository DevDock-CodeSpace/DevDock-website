import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, FileText, Folder, FolderInput, FolderPlus, MoreHorizontal, Plus, Workflow } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { NameDialog } from '@/components/NameDialog'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCollectionView } from '@/features/collections/hooks'
import type { DiagramSummary } from '@/features/diagrams/api'
import { CreateDiagramDialog } from '@/features/diagrams/components/CreateDiagramDialog'
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  createFolder,
  deleteFolder,
  MAX_FOLDER_DEPTH,
  moveFolderItems,
  renameFolder,
  type DocFolder,
  type DocSummary,
} from '../api'
import {
  describeItems,
  diagramKey,
  docKey,
  DRAG_TYPE,
  dropBlocker,
  folderKey,
  itemsOf,
  type DragItems,
} from '../dragDrop'
import { folderPath, folderSubtree } from '../folders'
import { useCanWriteDocs } from '../hooks'
import { useSelection } from '../useSelection'
import { CreateDocDialog } from './CreateDocDialog'
import { MoveDocDialog } from './MoveDocDialog'

/** Hovering a folder this long while dragging opens it (like a file manager), so you can drop deeper. */
const SPRING_LOAD_MS = 800

type DocBrowserProps = {
  teamId: string
  /** The scope being browsed: a workspace, or group-wide (null). */
  workspaceId: string | null
  /** The scope's docs (on the Diagrams page too, unshown: deleting a folder deletes them). */
  docs: DocSummary[]
  /** The scope's diagrams (empty when the Diagrams tool is off there). */
  diagrams: DiagramSummary[]
  folders: DocFolder[]
  /**
   * 'docs': the Docs page, docs and diagrams together with an All / Docs / Diagrams filter
   * (`?show=`). 'diagrams': the Diagrams page, the same folders showing diagrams only.
   */
  mode: 'docs' | 'diagrams'
  /** The Diagrams tool is on in this scope: diagrams show, and can be made, here. */
  diagramsEnabled: boolean
  /** Delete/move docs and diagrams, manage folders, and create diagrams (writers). */
  canWrite: boolean
  /** Create docs here (everyone who can edit docs in this scope). */
  canCreate: boolean
  docHref: (doc: DocSummary) => string
  diagramHref: (diagram: DiagramSummary) => string
  /** Shown when the top level is empty. */
  empty: ReactNode
}

type Show = 'all' | 'docs' | 'diagrams'
type Row = { kind: 'doc'; item: DocSummary } | { kind: 'diagram'; item: DiagramSummary }

/**
 * Dropbox-style browser for one scope's folders (3 levels deep), which hold docs and diagrams
 * side by side: a breadcrumb path, new docs for editors, and for writers: new diagrams, new
 * folder, rename/delete folders, and moving docs, diagrams and folders like in a file manager:
 * drag onto a folder or the path above (hover a folder to open it), select several with the
 * checkboxes or Ctrl/⌘/Shift-click and drag them together, or use "Move to…". Moves can be
 * undone. The open folder is in the URL (?folder=<id>), and so is the Docs page's filter (?show=).
 */
export function DocBrowser({
  teamId,
  workspaceId,
  docs,
  diagrams,
  folders,
  mode,
  diagramsEnabled,
  canWrite,
  canCreate,
  docHref,
  diagramHref,
  empty,
}: DocBrowserProps) {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [now] = useState(Date.now)
  const requested = params.get('folder')
  // A stale or foreign folder id falls back to the top level.
  const current = folders.find((f) => f.id === requested) ?? null
  const path = folderPath(current?.id ?? null, folders)
  const rootName = mode === 'diagrams' ? 'Diagrams' : 'Docs'
  const filtering = mode === 'docs' && diagramsEnabled
  const requestedShow = params.get('show')
  const show: Show = mode === 'diagrams' ? 'diagrams' : filtering && (requestedShow === 'docs' || requestedShow === 'diagrams') ? requestedShow : 'all'
  const showDocs = show !== 'diagrams'
  const showDiagrams = diagramsEnabled && show !== 'docs'
  const entries = useMemo(() => ({ docs, diagrams: diagramsEnabled ? diagrams : [] }), [docs, diagrams, diagramsEnabled])
  const subfolders = folders.filter((f) => f.parent_id === (current?.id ?? null))
  const inFolder = (folderId: string | null): Row[] =>
    [
      ...(showDocs ? docs.filter((d) => d.folder_id === folderId).map((item) => ({ kind: 'doc' as const, item })) : []),
      ...(showDiagrams ? entries.diagrams.filter((d) => d.folder_id === folderId).map((item) => ({ kind: 'diagram' as const, item })) : []),
    ].sort((a, b) => b.item.updated_at.localeCompare(a.item.updated_at))
  const here = inFolder(current?.id ?? null)
  const canNest = (current?.depth ?? 0) < MAX_FOLDER_DEPTH

  // Who may make a diagram here. At a group's top level the new diagram may go in any workspace the
  // person writes in (the dialog asks); inside a folder or a workspace it's this scope's writers.
  const canWriteIn = useCanWriteDocs()
  const { workspaces } = useCollectionView()
  const canNewDiagram =
    diagramsEnabled &&
    (workspaceId !== null || current ? canWrite : canWriteIn(null) || workspaces.some((w) => canWriteIn(w.id)))
  const canNewDoc = mode === 'docs' && canCreate
  const [creating, setCreating] = useState<'doc' | 'diagram' | null>(null)

  // What a move or delete can change: the lists and the folders, never an open doc or its images.
  const refresh = () =>
    Promise.all(
      [['documents', 'team'], ['documents', 'workspace'], ['documents', 'folders'], ['diagrams', 'team'], ['diagrams', 'workspace']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
  const setShow = (next: Show) =>
    setParams((p) => {
      if (next === 'all') p.delete('show')
      else p.set('show', next)
      return p
    })
  const open = (folderId: string | null) =>
    setParams((p) => {
      if (folderId) p.set('folder', folderId)
      else p.delete('folder')
      return p
    })

  // ------------------------------------------------------------ dialogs
  const [naming, setNaming] = useState<{ mode: 'create' } | { mode: 'rename'; folder: DocFolder } | null>(null)
  const [moving, setMoving] = useState<DragItems | null>(null)
  const [deleting, setDeleting] = useState<DocFolder | null>(null)
  const [busy, setBusy] = useState(false)
  const toDelete = deleting ? folderSubtree(deleting.id, folders) : new Set<string>()
  const docsToDelete = docs.filter((d) => d.folder_id && toDelete.has(d.folder_id))
  const diagramsToDelete = entries.diagrams.filter((d) => d.folder_id && toDelete.has(d.folder_id))

  const removeFolder = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      // Step out of the folder first if we're inside it.
      if (current && toDelete.has(current.id)) open(deleting.parent_id)
      await deleteFolder(teamId, deleting.id, {
        docIds: docsToDelete.map((d) => d.id),
        diagramIds: diagramsToDelete.map((d) => d.id),
      })
      toast.success(`${deleting.name} was deleted`)
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  // ------------------------------------------------------------ selection
  const rowKey = (row: Row) => (row.kind === 'doc' ? docKey(row.item.id) : diagramKey(row.item.id))
  const keys = useMemo(() => [...subfolders.map((f) => folderKey(f.id)), ...here.map(rowKey)], [subfolders, here])
  const selection = useSelection(keys)
  useEffect(() => {
    if (selection.count === 0) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') selection.clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selection])
  /** A Ctrl/⌘ or Shift click selects instead of opening. */
  const selectClick = (key: string) => (event: MouseEvent) => {
    if (canWrite && selection.click(key, event)) event.preventDefault()
  }

  // ------------------------------------------------------------ moving
  const targetName = (folderId: string | null) => folders.find((f) => f.id === folderId)?.name ?? rootName

  const move = async (items: DragItems, targetId: string | null, origin: string | null) => {
    const blocked = dropBlocker(items, targetId, folders, entries)
    if (blocked) {
      if (blocked !== 'Already here') toast.error(blocked)
      return
    }
    const what = describeItems(items, entries, folders)
    try {
      await moveFolderItems({ ...items, targetId })
      selection.clear()
      await refresh()
      toast.success(`Moved ${what} to ${targetName(targetId)}`, {
        action: {
          label: 'Undo',
          onClick: () => {
            moveFolderItems({ ...items, targetId: origin })
              .then(() => refresh())
              .catch((error: unknown) => toast.error(errorMessage(error)))
          },
        },
      })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  // ------------------------------------------------------------ drag & drop
  // What is being dragged is kept in state: the browser hides dataTransfer's contents until the drop,
  // and we need it while hovering to tell which folders accept it.
  const [dragging, setDragging] = useState<{ items: DragItems; origin: string | null } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const spring = useRef<{ target: string | null; timer: number | undefined }>({ target: null, timer: undefined })
  const disarmSpring = () => {
    window.clearTimeout(spring.current.timer)
    spring.current = { target: null, timer: undefined }
  }
  useEffect(() => () => window.clearTimeout(spring.current.timer), [])

  const dragId = useRef(0)
  const startDrag = (event: DragEvent, key: string) => {
    // Dragging something that isn't selected drags just that one and leaves the selection alone, like
    // Explorer or Finder. (Changing the selection here would insert the "N selected" bar and shift the
    // list under the cursor, which makes the browser cancel the drag.)
    const items = itemsOf(selection.has(key) ? selection.selected : [key])
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(items))
    event.dataTransfer.effectAllowed = 'move'
    // A small label instead of a faded copy of the whole row.
    const ghost = document.createElement('div')
    ghost.textContent = describeItems(items, entries, folders).replace(/[“”]/g, '')
    ghost.className = 'fixed -top-96 left-0 max-w-64 truncate rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-lg'
    document.body.append(ghost)
    event.dataTransfer.setDragImage(ghost, 12, 12)
    window.setTimeout(() => ghost.remove(), 0)
    // The styling that follows (dimmed rows, drop targets) is applied a moment later: changing the
    // dragged row's DOM inside dragstart can cancel the drag. A drag that already ended is ignored.
    const id = ++dragId.current
    window.setTimeout(() => {
      if (dragId.current === id) setDragging({ items, origin: current?.id ?? null })
    }, 0)
  }
  const endDrag = () => {
    dragId.current += 1
    setDragging(null)
    setDropTarget(null)
    disarmSpring()
  }

  const blockerFor = (folderId: string | null) => (dragging ? dropBlocker(dragging.items, folderId, folders, entries) : null)
  const dropProps = (folderId: string | null, springLoad = false) =>
    canWrite
      ? {
          onDragOver: (e: DragEvent) => {
            if (!dragging) return
            if (blockerFor(folderId) !== null) {
              e.dataTransfer.dropEffect = 'none'
              return
            }
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDropTarget(folderId ?? 'top')
            if (springLoad && folderId && spring.current.target !== folderId) {
              disarmSpring()
              spring.current.target = folderId
              spring.current.timer = window.setTimeout(() => {
                open(folderId)
                disarmSpring()
              }, SPRING_LOAD_MS)
            }
          },
          onDragLeave: (e: DragEvent) => {
            // Moving between a row's own children doesn't count as leaving it.
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
            setDropTarget(null)
            disarmSpring()
          },
          onDrop: (e: DragEvent) => {
            if (!dragging) return
            e.preventDefault()
            const { items, origin } = dragging
            endDrag()
            void move(items, folderId, origin)
          },
        }
      : {}
  const isDropTarget = (folderId: string | null) => dropTarget === (folderId ?? 'top')
  /** Dim a folder that can't take what's being dragged. */
  const refuses = (folderId: string) => {
    const reason = blockerFor(folderId)
    return reason !== null && reason !== 'Already here'
  }
  const isDragged = (key: string) =>
    dragging !== null &&
    (dragging.items.docIds.map(docKey).includes(key) ||
      dragging.items.diagramIds.map(diagramKey).includes(key) ||
      dragging.items.folderIds.map(folderKey).includes(key))

  /** What a folder holds, counting only the kinds on show. */
  const count = (folder: DocFolder) => folders.filter((f) => f.parent_id === folder.id).length + inFolder(folder.id).length

  const checkbox = (key: string, name: string) =>
    canWrite && (
      <input
        type="checkbox"
        aria-label={`Select ${name}`}
        checked={selection.has(key)}
        onChange={() => selection.toggle(key)}
        className={cn(
          'relative z-10 size-4 shrink-0 cursor-pointer accent-[var(--brand)] transition-opacity focus-visible:opacity-100',
          selection.count > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      />
    )

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Folder path" className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
          {[null, ...path].map((folder, i) => {
            const last = i === path.length
            return (
              <span key={folder?.id ?? 'top'} className="flex min-w-0 items-center gap-0.5">
                {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                <button
                  type="button"
                  onClick={() => open(folder?.id ?? null)}
                  aria-current={last ? 'page' : undefined}
                  className={cn(
                    'max-w-48 truncate rounded-sm px-1.5 py-0.5 transition-colors hover:bg-muted',
                    last ? 'font-semibold' : 'text-muted-foreground',
                    isDropTarget(folder?.id ?? null) && !last && 'bg-brand/10 ring-1 ring-brand',
                    dragging && !last && blockerFor(folder?.id ?? null) !== null && 'opacity-50',
                  )}
                  {...(last ? {} : dropProps(folder?.id ?? null))}
                >
                  {folder?.name ?? rootName}
                </button>
              </span>
            )
          })}
          <span className="ml-2 font-mono text-xs text-muted-foreground">{subfolders.length + here.length}</span>
        </nav>
        {(canWrite || canNewDoc || canNewDiagram || filtering) && (
          <div className="flex flex-wrap items-center gap-2">
            {filtering && (
              <div role="group" aria-label="Show" className="flex items-center rounded-md border p-0.5">
                {(['all', 'docs', 'diagrams'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={show === option}
                    onClick={() => setShow(option)}
                    className={cn(
                      'h-6 rounded-sm px-2 text-xs transition-colors',
                      show === option ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {option === 'all' ? 'All' : option === 'docs' ? 'Docs' : 'Diagrams'}
                  </button>
                ))}
              </div>
            )}
            {canWrite && (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span: tooltips need a hoverable element even when the button is disabled */}
                  <span tabIndex={canNest ? -1 : 0}>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canNest}
                      onClick={() => setNaming({ mode: 'create' })}
                    >
                      <FolderPlus /> New folder
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canNest && <TooltipContent>Folders can be nested {MAX_FOLDER_DEPTH} levels deep</TooltipContent>}
              </Tooltip>
            )}
            {canNewDoc && canNewDiagram ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm">
                      <Plus /> New <ChevronDown className="opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setCreating('doc')}>
                      <FileText /> Doc
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setCreating('diagram')}>
                      <Workflow /> Diagram
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <CreateDocDialog
                  workspaceId={workspaceId ?? undefined}
                  folderId={current?.id ?? null}
                  open={creating === 'doc'}
                  onOpenChange={(o) => setCreating(o ? 'doc' : null)}
                />
                <CreateDiagramDialog
                  workspaceId={workspaceId ?? undefined}
                  folderId={current?.id ?? null}
                  open={creating === 'diagram'}
                  onOpenChange={(o) => setCreating(o ? 'diagram' : null)}
                />
              </>
            ) : canNewDoc ? (
              <CreateDocDialog workspaceId={workspaceId ?? undefined} folderId={current?.id ?? null} />
            ) : canNewDiagram ? (
              <CreateDiagramDialog workspaceId={workspaceId ?? undefined} folderId={current?.id ?? null} />
            ) : null}
          </div>
        )}
      </div>

      {selection.count > 0 && (
        <div role="status" className="mb-2 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
          <span className="font-medium">{selection.count} selected</span>
          <Button size="xs" variant="outline" onClick={() => setMoving(itemsOf(selection.selected))}>
            <FolderInput /> Move to…
          </Button>
          {selection.count < keys.length && (
            <Button size="xs" variant="ghost" onClick={selection.all}>Select all</Button>
          )}
          <Button size="xs" variant="ghost" onClick={selection.clear}>Clear</Button>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">Drag any selected item to move them all</span>
        </div>
      )}

      {subfolders.length === 0 && here.length === 0 ? (
        <div className="border-y py-10 text-center text-sm text-muted-foreground">
          {show !== 'all' ? `No ${show} ${current ? 'in this folder' : 'here yet'}.` : current ? 'This folder is empty.' : empty}
        </div>
      ) : (
        <ul className={cn('divide-y border-y', canWrite && 'select-none')}>
          {subfolders.map((folder) => {
            const key = folderKey(folder.id)
            return (
              <li
                key={folder.id}
                data-selected={selection.has(key) || undefined}
                draggable={canWrite}
                onDragStart={(e) => startDrag(e, key)}
                onDragEnd={endDrag}
                {...dropProps(folder.id, true)}
                className={cn(
                  'group relative flex h-11 items-center gap-3 px-3 transition-colors hover:bg-muted/50',
                  selection.has(key) && 'bg-brand/5',
                  isDragged(key) && 'opacity-40',
                  dragging && refuses(folder.id) && 'opacity-50',
                  isDropTarget(folder.id) && 'bg-brand/10 ring-1 ring-brand ring-inset',
                )}
              >
                {checkbox(key, folder.name)}
                <Folder className="size-4 shrink-0 fill-muted-foreground/15 text-muted-foreground" />
                <button
                  type="button"
                  onClick={(e) => {
                    if (canWrite && selection.click(key, e)) return
                    open(folder.id)
                  }}
                  className="min-w-0 truncate text-left text-sm font-medium outline-none after:absolute after:inset-0"
                >
                  {folder.name}
                </button>
                <span className="font-mono text-xs text-muted-foreground">{plural(count(folder), 'item')}</span>
                <span className="flex-1" />
                <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
                  {timeAgo(folder.updated_at, now)}
                </span>
                {canWrite && (
                  <RowMenu label={`${folder.name} actions`}>
                    <DropdownMenuItem onSelect={() => setNaming({ mode: 'rename', folder })}>Rename</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setMoving({ docIds: [], diagramIds: [], folderIds: [folder.id] })}>Move to…</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(folder)}>
                      Delete
                    </DropdownMenuItem>
                  </RowMenu>
                )}
              </li>
            )
          })}
          {here.map((row) => {
            const key = rowKey(row)
            const { item } = row
            const Icon = row.kind === 'doc' ? FileText : Workflow
            return (
              <li
                key={key}
                data-selected={selection.has(key) || undefined}
                draggable={canWrite}
                onDragStart={(e) => startDrag(e, key)}
                onDragEnd={endDrag}
                className={cn(
                  'group relative flex h-11 items-center gap-3 px-3 transition-colors hover:bg-muted/50',
                  selection.has(key) && 'bg-brand/5',
                  isDragged(key) && 'opacity-40',
                )}
              >
                {checkbox(key, item.title)}
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={row.kind === 'doc' ? 'Doc' : 'Diagram'} />
                <Link
                  to={row.kind === 'doc' ? docHref(row.item) : diagramHref(row.item)}
                  draggable={false}
                  onClick={selectClick(key)}
                  className="min-w-0 truncate text-sm font-medium outline-none after:absolute after:inset-0"
                >
                  {item.title}
                </Link>
                <span className="flex-1" />
                <span className="hidden min-w-0 items-center gap-2 md:flex">
                  <PersonAvatar profile={item.author} className="size-5" />
                  <span className="max-w-32 truncate text-xs text-muted-foreground">
                    {item.author?.display_name ?? 'Former member'}
                  </span>
                </span>
                <span className="hidden w-24 text-right font-mono text-xs text-muted-foreground sm:inline">
                  {timeAgo(item.updated_at, now)}
                </span>
                {canWrite && (
                  <RowMenu label={`${item.title} actions`}>
                    <DropdownMenuItem
                      onSelect={() =>
                        setMoving(
                          row.kind === 'doc'
                            ? { docIds: [item.id], diagramIds: [], folderIds: [] }
                            : { docIds: [], diagramIds: [item.id], folderIds: [] },
                        )
                      }
                    >
                      Move to…
                    </DropdownMenuItem>
                  </RowMenu>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {canWrite && subfolders.length + here.length > 0 && selection.count === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Tip: drag {mode === 'diagrams' ? 'diagrams' : diagramsEnabled ? 'docs, diagrams' : 'docs'} and folders onto a folder, or onto the path above, to move them. Tick the boxes (or Ctrl/⌘-click, Shift-click) to move several at once.
        </p>
      )}

      <NameDialog
        key={naming ? (naming.mode === 'rename' ? `rename-${naming.folder.id}` : 'create') : 'name-closed'}
        open={naming !== null}
        onOpenChange={(o) => !o && setNaming(null)}
        title={naming?.mode === 'rename' ? `Rename “${naming.folder.name}”` : 'New folder'}
        description={
          naming?.mode === 'rename'
            ? 'Everyone who can see what’s inside sees the new name.'
            : `In ${current?.name ?? rootName}. Folders hold docs and diagrams, and can be nested ${MAX_FOLDER_DEPTH} levels deep.`
        }
        initialName={naming?.mode === 'rename' ? naming.folder.name : ''}
        submitLabel={naming?.mode === 'rename' ? 'Rename' : 'Create folder'}
        placeholder="Week 1"
        onSubmit={async (name) => {
          if (naming?.mode === 'rename') await renameFolder(naming.folder.id, name)
          else await createFolder({ teamId, workspaceId, parentId: current?.id ?? null, name })
          await refresh()
        }}
      />
      <MoveDocDialog
        key={moving ? `move-${[...moving.docIds, ...moving.diagramIds, ...moving.folderIds].join(',')}` : 'move-closed'}
        open={moving !== null}
        onOpenChange={(o) => !o && setMoving(null)}
        title={moving ? describeItems(moving, entries, folders) : ''}
        currentFolderId={current?.id ?? null}
        folders={folders}
        blocker={(folderId) => (moving ? dropBlocker(moving, folderId, folders, entries) : null)}
        onMove={async (folderId) => {
          if (moving) await move(moving, folderId, current?.id ?? null)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description={
          toDelete.size - 1 + docsToDelete.length + diagramsToDelete.length === 0
            ? 'The folder is empty. This can’t be undone.'
            : `Everything inside goes too: ${listOf(
                [
                  [toDelete.size - 1, 'folder'] as const,
                  [docsToDelete.length, 'doc'] as const,
                  [diagramsToDelete.length, 'diagram'] as const,
                ]
                  .filter(([n]) => n > 0)
                  .map(([n, word]) => plural(n, word)),
              )}. This can’t be undone.`
        }
        confirmLabel="Delete folder"
        pending={busy}
        onConfirm={() => void removeFolder()}
      />
    </div>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const listOf = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`)

function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className="relative z-10 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
