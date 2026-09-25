import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, FileText, Folder, FolderPlus, MoreHorizontal } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'
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
import { errorMessage } from '@/lib/errors'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  createFolder,
  deleteFolder,
  MAX_FOLDER_DEPTH,
  moveDocument,
  renameFolder,
  type DocFolder,
  type DocSummary,
} from '../api'
import { folderPath, folderSubtree } from '../folders'
import { CreateDocDialog } from './CreateDocDialog'
import { MoveDocDialog } from './MoveDocDialog'

/** dataTransfer type for dragging a doc onto a folder or breadcrumb. */
const DRAG_TYPE = 'application/x-devdock-doc'

type DocBrowserProps = {
  teamId: string
  /** The scope being browsed: a workspace, or group-wide (null). */
  workspaceId: string | null
  docs: DocSummary[]
  folders: DocFolder[]
  canWrite: boolean
  docHref: (doc: DocSummary) => string
  /** Shown when the top level is empty. */
  empty: ReactNode
}

/**
 * Dropbox-style docs browser for one scope: folders (3 levels deep) and docs,
 * a breadcrumb path, and for writers: new folder/doc here, rename/delete
 * folders, move docs (menu or drag onto a folder or a breadcrumb).
 * The open folder is in the URL (?folder=<id>).
 */
export function DocBrowser({ teamId, workspaceId, docs, folders, canWrite, docHref, empty }: DocBrowserProps) {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [now] = useState(Date.now)
  const requested = params.get('folder')
  // A stale or foreign folder id falls back to the top level.
  const current = folders.find((f) => f.id === requested) ?? null
  const path = folderPath(current?.id ?? null, folders)
  const subfolders = folders.filter((f) => f.parent_id === (current?.id ?? null))
  const here = docs.filter((d) => d.folder_id === (current?.id ?? null))
  const canNest = (current?.depth ?? 0) < MAX_FOLDER_DEPTH

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['documents'] })
  const open = (folderId: string | null) =>
    setParams((p) => {
      if (folderId) p.set('folder', folderId)
      else p.delete('folder')
      return p
    })

  // ------------------------------------------------------------ dialogs
  const [naming, setNaming] = useState<{ mode: 'create' } | { mode: 'rename'; folder: DocFolder } | null>(null)
  const [moving, setMoving] = useState<DocSummary | null>(null)
  const [deleting, setDeleting] = useState<DocFolder | null>(null)
  const [busy, setBusy] = useState(false)
  const toDelete = deleting ? folderSubtree(deleting.id, folders) : new Set<string>()
  const docsToDelete = docs.filter((d) => d.folder_id && toDelete.has(d.folder_id))

  const move = async (doc: DocSummary, folderId: string | null) => {
    if (doc.folder_id === folderId) return
    try {
      await moveDocument(doc.id, folderId)
      await refresh()
      toast.success(`Moved “${doc.title}” to ${folders.find((f) => f.id === folderId)?.name ?? 'Docs'}`)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const removeFolder = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      // Step out of the folder first if we're inside it.
      if (current && toDelete.has(current.id)) open(deleting.parent_id)
      await deleteFolder(teamId, deleting.id, docsToDelete.map((d) => d.id))
      toast.success(`${deleting.name} was deleted`)
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  // ------------------------------------------------------------ drag & drop
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dropProps = (folderId: string | null) =>
    canWrite
      ? {
          onDragOver: (e: DragEvent) => {
            if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
            e.preventDefault()
            setDropTarget(folderId ?? 'top')
          },
          onDragLeave: () => setDropTarget(null),
          onDrop: (e: DragEvent) => {
            e.preventDefault()
            setDropTarget(null)
            const doc = docs.find((d) => d.id === e.dataTransfer.getData(DRAG_TYPE))
            if (doc) void move(doc, folderId)
          },
        }
      : {}
  const isDropTarget = (folderId: string | null) => dropTarget === (folderId ?? 'top')

  const count = (folder: DocFolder) =>
    folders.filter((f) => f.parent_id === folder.id).length + docs.filter((d) => d.folder_id === folder.id).length

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
                  )}
                  {...(last ? {} : dropProps(folder?.id ?? null))}
                >
                  {folder?.name ?? 'Docs'}
                </button>
              </span>
            )
          })}
          <span className="ml-2 font-mono text-xs text-muted-foreground">{subfolders.length + here.length}</span>
        </nav>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                {/* span: tooltips need a hoverable element even when the button is disabled */}
                <span tabIndex={canNest ? -1 : 0}>
                  <Button size="sm" variant="outline" disabled={!canNest} onClick={() => setNaming({ mode: 'create' })}>
                    <FolderPlus /> New folder
                  </Button>
                </span>
              </TooltipTrigger>
              {!canNest && <TooltipContent>Folders can be nested {MAX_FOLDER_DEPTH} levels deep</TooltipContent>}
            </Tooltip>
            <CreateDocDialog workspaceId={workspaceId ?? undefined} folderId={current?.id ?? null} />
          </div>
        )}
      </div>

      {subfolders.length === 0 && here.length === 0 ? (
        <div className="border-y py-10 text-center text-sm text-muted-foreground">
          {current ? 'This folder is empty.' : empty}
        </div>
      ) : (
        <ul className="divide-y border-y">
          {subfolders.map((folder) => (
            <li
              key={folder.id}
              {...dropProps(folder.id)}
              className={cn(
                'group relative flex h-11 items-center gap-3 px-3 transition-colors hover:bg-muted/50',
                isDropTarget(folder.id) && 'bg-brand/10 ring-1 ring-brand ring-inset',
              )}
            >
              <Folder className="size-4 shrink-0 fill-muted-foreground/15 text-muted-foreground" />
              <button
                type="button"
                onClick={() => open(folder.id)}
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
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(folder)}>
                    Delete
                  </DropdownMenuItem>
                </RowMenu>
              )}
            </li>
          ))}
          {here.map((doc) => (
            <li
              key={doc.id}
              draggable={canWrite}
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, doc.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              className="group relative flex h-11 items-center gap-3 px-3 transition-colors hover:bg-muted/50"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <Link
                to={docHref(doc)}
                draggable={false}
                className="min-w-0 truncate text-sm font-medium outline-none after:absolute after:inset-0"
              >
                {doc.title}
              </Link>
              <span className="flex-1" />
              <span className="hidden min-w-0 items-center gap-2 md:flex">
                <PersonAvatar profile={doc.author} className="size-5" />
                <span className="max-w-32 truncate text-xs text-muted-foreground">
                  {doc.author?.display_name ?? 'Former member'}
                </span>
              </span>
              <span className="hidden w-24 text-right font-mono text-xs text-muted-foreground sm:inline">
                {timeAgo(doc.updated_at, now)}
              </span>
              {canWrite && (
                <RowMenu label={`${doc.title} actions`}>
                  <DropdownMenuItem onSelect={() => setMoving(doc)}>Move to…</DropdownMenuItem>
                </RowMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && here.length > 0 && folders.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Tip: drag a doc onto a folder, or onto the path above, to move it.</p>
      )}

      <NameDialog
        key={naming ? (naming.mode === 'rename' ? `rename-${naming.folder.id}` : 'create') : 'name-closed'}
        open={naming !== null}
        onOpenChange={(o) => !o && setNaming(null)}
        title={naming?.mode === 'rename' ? `Rename “${naming.folder.name}”` : 'New folder'}
        description={
          naming?.mode === 'rename'
            ? 'Everyone who can see these docs sees the new name.'
            : `In ${current?.name ?? 'Docs'}. Folders can be nested ${MAX_FOLDER_DEPTH} levels deep.`
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
        key={moving ? `move-${moving.id}` : 'move-closed'}
        open={moving !== null}
        onOpenChange={(o) => !o && setMoving(null)}
        docTitle={moving?.title ?? ''}
        currentFolderId={moving?.folder_id ?? null}
        folders={folders}
        onMove={async (folderId) => {
          if (moving) await move(moving, folderId)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description={
          toDelete.size - 1 + docsToDelete.length === 0
            ? 'The folder is empty. This can’t be undone.'
            : `Everything inside goes too: ${plural(toDelete.size - 1, 'folder')} and ${plural(docsToDelete.length, 'doc')}. This can’t be undone.`
        }
        confirmLabel="Delete folder"
        pending={busy}
        onConfirm={() => void removeFolder()}
      />
    </div>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

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
