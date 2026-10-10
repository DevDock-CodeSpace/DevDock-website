import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { accessOptions } from '../access'
import type { Collection, WorkspaceAccess } from '../api'

/** Who gets in besides the people added. `collection` is the one the workspace is (or will be) in. */
export function AccessSelect({
  id,
  value,
  onChange,
  collection,
  disabled,
}: {
  id?: string
  value: WorkspaceAccess
  onChange: (value: WorkspaceAccess) => void
  collection: Collection | undefined
  disabled?: boolean
}) {
  const options = accessOptions(collection)
  return (
    <Select
      value={value}
      // Radix reports '' when the option list changes under it (a collection was picked); ignore that.
      onValueChange={(v) => {
        const picked = options.find((option) => option.value === v)
        if (picked) onChange(picked.value)
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
            <span className="text-xs text-muted-foreground">· {option.hint}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
