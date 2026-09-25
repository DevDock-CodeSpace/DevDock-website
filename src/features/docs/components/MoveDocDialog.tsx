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

/** "Move to…": pick a folder in the doc's scope (tree, indented by depth) or the top level. */
export function MoveDocDialog({
  open,
  onOpenChange,
  docTitle,
  currentFolderId,
  folders,
  onMove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  docTitle: string
  currentFolderId: string | null
  folders: DocFolder[]
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
          <DialogTitle>Move “{docTitle}”</DialogTitle>
          <DialogDescription>Choose a folder.</DialogDescription>
        </DialogHeader>
        <ul role="listbox" aria-label="Folders" className="max-h-72 overflow-y-auto rounded-md border p-1">
          {options.map((option) => {
            const selected = option.id === target
            const Icon = option.id === null ? FolderOpen : Folder
            return (
              <li
                key={option.id ?? 'top'}
                role="option"
                aria-selected={selected}
                onClick={() => setTarget(option.id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 text-sm hover:bg-muted',
                  selected && 'bg-muted font-medium',
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
          <Button disabled={target === currentFolderId || pending} onClick={() => void move()}>
            {pending && <LoaderCircle className="animate-spin" />}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
