import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { workspaceTypes } from '@/features/teams/permissions'
import type { WorkspaceType } from '../api'

export function WorkspaceTypeSelect({
  id,
  value,
  onChange,
  disabled,
  types = Object.keys(workspaceTypes) as WorkspaceType[],
}: {
  id?: string
  value: WorkspaceType
  onChange: (value: WorkspaceType) => void
  disabled?: boolean
  /** The types this group can contain (allowedWorkspaceTypes). */
  types?: WorkspaceType[]
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as WorkspaceType)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {types.map((type) => {
          const { label, hint, icon: Icon } = workspaceTypes[type]
          return (
            <SelectItem key={type} value={type}>
              <Icon className="text-muted-foreground" />
              {label}
              <span className="text-xs text-muted-foreground">· {hint}</span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
