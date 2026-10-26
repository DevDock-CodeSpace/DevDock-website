import { Lock, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { FileKind } from '../sharing'
import { ShareDialog, type ShareableItem } from './ShareDialog'

/** "Share" in a doc's or whiteboard's header; a lock when it's restricted. Everyone can see who has access. */
export function ShareButton({ kind, item }: { kind: FileKind; item: ShareableItem }) {
  const [open, setOpen] = useState(false)
  const restricted = item.access === 'restricted'
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        title={restricted ? 'Restricted: see who has access' : 'Share'}
        onClick={() => setOpen(true)}
      >
        {restricted ? <Lock className="size-3.5" /> : <Share2 className="size-3.5" />}
        {restricted ? 'Restricted' : 'Share'}
      </Button>
      {open && <ShareDialog kind={kind} item={item} open onOpenChange={setOpen} />}
    </>
  )
}
