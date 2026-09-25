import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SHORTCUTS } from '../shortcuts'

/** "?" help: the issue keyboard shortcuts. */
export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work anywhere on the issue screens, except while typing.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {SHORTCUTS.map(({ group, items }) => (
            <section key={group}>
              <h3 className="mb-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">{group}</h3>
              <dl className="divide-y">
                {items.map(([keys, action]) => (
                  <div key={keys} className="flex items-center justify-between py-1.5 text-sm">
                    <dt>{action}</dt>
                    <dd>
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{keys}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
