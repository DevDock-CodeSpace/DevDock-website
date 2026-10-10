import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Collection } from '@/features/workspaces/api'

const NONE = 'none'

/** Picks one of the group's collections, or none (null). */
export function CollectionSelect({
  id,
  value,
  onChange,
  collections,
  disabled,
}: {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
  collections: Collection[]
  disabled?: boolean
}) {
  return (
    <Select
      value={value ?? NONE}
      // Radix can report '' while its options change; only a real choice counts.
      onValueChange={(v) => v && onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No collection</SelectItem>
        {collections.map((collection) => (
          <SelectItem key={collection.id} value={collection.id}>
            {collection.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
