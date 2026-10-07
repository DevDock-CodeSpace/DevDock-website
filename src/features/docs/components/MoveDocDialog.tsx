import { Check, Folder, FolderOpen, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { DocFolder } from '../api'
import { folderTree } from '../folders'

/** "Move to…": pick a folder in the scope (tree, indented by depth) or the top level, for one or several items. */
export function MoveDocDialog({
  open,
  onOpenChange,
  title,
  currentFolderId,
  folders,
  blocker,
  onMove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What is being moved: “Report”, “3 items”. */
  title: string
  /** Where the items are now (marked "current"). */
  currentFolderId: string | null
  folders: DocFolder[]
  /** Why items can't go into a folder (null = top level), or null when they can. */
  blocker: (folderId: string | null) => string | null
  onMove: (folderId: string | null) => Promise<void>
}) {
  const [target, setTarget] = useState<string | null>(currentFolderId)
  const [pending, setPending] = useState(false)
  const options: { id: string | null; name: string; depth: number }[] = [
    { id: null, name: 'Docs (top level)', depth: 0 },
    ...folderTree(folders).map((f) => ({ id: f.id, name: f.name, depth: f.depth })),
  ]

  const move = async () => {
    setPending(true)
    try {
      await onMove(target)
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {title}</DialogTitle>
          <DialogDescription>Choose a folder.</DialogDescription>
        </DialogHeader>
        <ul role="listbox" aria-label="Folders" className="max-h-72 overflow-y-auto rounded-md border p-1">
          {options.map((option) => {
            const selected = option.id === target
            const blocked = blocker(option.id)
            const Icon = option.id === null ? FolderOpen : Folder
            return (
              <li
                key={option.id ?? 'top'}
                role="option"
                aria-selected={selected}
                aria-disabled={blocked !== null && option.id !== currentFolderId ? true : undefined}
                title={blocked && option.id !== currentFolderId ? blocked : undefined}
                onClick={() => {
                  if (blocked === null || option.id === currentFolderId) setTarget(option.id)
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 text-sm hover:bg-muted',
                  selected && 'bg-muted font-medium',
                  blocked !== null && option.id !== currentFolderId && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                )}
                style={{ paddingLeft: 8 + option.depth * 16 }}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
                {option.id === currentFolderId && <span className="text-xs text-muted-foreground">current</span>}
                {selected && <Check className="size-3.5 text-brand" />}
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button disabled={target === currentFolderId || blocker(target) !== null || pending} onClick={() => void move()}>
            {pending && <LoaderCircle className="animate-spin" />}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
