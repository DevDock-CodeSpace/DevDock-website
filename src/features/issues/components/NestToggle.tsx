import { ListTree } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Lists sub-issues under their parent (opened with an arrow) instead of on their own. */
export function NestToggle({ nested, onChange }: { nested: boolean; onChange: (nested: boolean) => void }) {
  return (
    <Button
      variant={nested ? 'secondary' : 'ghost'}
      size="icon-sm"
      aria-label={nested ? 'Show sub-issues on their own' : 'Nest sub-issues under their parent'}
      aria-pressed={nested}
      title={nested ? 'Sub-issues nested: click to list them on their own' : 'Nest sub-issues under their parent'}
      onClick={() => onChange(!nested)}
    >
      <ListTree />
    </Button>
  )
}
