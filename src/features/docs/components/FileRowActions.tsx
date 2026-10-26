import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { deleteDiagram } from '@/features/diagrams/api'
import { errorMessage } from '@/lib/errors'
import { ownWrite } from '@/lib/realtime'
import { deleteDocument, foldersQuery, moveFolderItems, type DocFolder, type DocSummary } from '../api'
import { MoveDocDialog } from './MoveDocDialog'

/** What a move or delete changes: the lists (and Files' folder counts), never another open item. */
const LISTS = [['documents', 'team'], ['documents', 'workspace'], ['diagrams', 'team'], ['diagrams', 'workspace']]

/**
 * The ··· on a doc or diagram row in Files (Folders, Docs, Diagrams, Recent): Move to… a folder of
 * its own place (moves can be undone) and Delete (asks first). Only rendered for writers; the
 * database re-checks both. Folders are the ones passed in, or the item's place's folders, loaded
 * when "Move to…" opens.
 */
export function FileRowActions({
  kind,
  item,
  folders: knownFolders,
}: {
  kind: 'doc' | 'diagram'
  item: DocSummary
  folders?: DocFolder[]
}) {
  const queryClient = useQueryClient()
  const [moving, setMoving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const loaded = useQuery({ ...foldersQuery(item.team_id, item.workspace_id), enabled: moving && !knownFolders }).data
  const folders = knownFolders ?? loaded ?? []
  const noun = kind === 'doc' ? 'doc' : 'whiteboard'
  const refresh = () => Promise.all(LISTS.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
  const ids = (target: string | null) => ({
    docIds: kind === 'doc' ? [item.id] : [],
    diagramIds: kind === 'diagram' ? [item.id] : [],
    folderIds: [],
    targetId: target,
  })

  const move = async (target: string | null) => {
    const from = item.folder_id
    try {
      await moveFolderItems(ids(target))
      await refresh()
      toast.success(`Moved “${item.title}” to ${folders.find((f) => f.id === target)?.name ?? 'the top level (not in a folder)'}`, {
        action: {
          label: 'Undo',
          onClick: () => {
            moveFolderItems(ids(from))
              .then(() => refresh())
              .catch((error: unknown) => toast.error(errorMessage(error)))
          },
        },
      })
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      // Its own echo needn't refetch anything: the lists are refreshed here.
      ownWrite(kind === 'doc' ? 'documents' : 'diagrams', item.id, 15_000)
      if (kind === 'doc') await deleteDocument(item.team_id, item.id)
      else await deleteDiagram(item.id)
      queryClient.removeQueries({ queryKey: [kind === 'doc' ? 'documents' : 'diagrams', item.id] })
      await refresh()
      toast.success(`${item.title} was deleted`)
      setDeleting(false)
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${item.title} actions`}
            className="relative z-10 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setMoving(true)}>Move to…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {moving && (
        <MoveDocDialog
          open
          onOpenChange={(o) => !o && setMoving(false)}
          title={`“${item.title}”`}
          currentFolderId={item.folder_id}
          folders={folders}
          blocker={() => null}
          onMove={move}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${item.title}”?`}
        description={`The ${noun} is deleted for everyone who can see it. This can’t be undone.`}
        confirmLabel={`Delete ${noun}`}
        pending={busy}
        onConfirm={() => void remove()}
      />
    </>
  )
}
