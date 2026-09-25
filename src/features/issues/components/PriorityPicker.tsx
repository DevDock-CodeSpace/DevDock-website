import type { ReactNode } from 'react'
import type { IssuePriority } from '../api'
import { PRIORITY_ORDER, priorityLabel } from '../meta'
import { Picker } from './Picker'
import { PriorityIcon } from './PriorityIcon'

export function PriorityPicker({
  value,
  onChange,
  children,
  align,
  open,
  onOpenChange,
}: {
  value: IssuePriority
  onChange: (priority: IssuePriority) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <Picker
      open={open}
      onOpenChange={onOpenChange}
      placeholder="Set priority…"
      align={align}
      selected={[String(value)]}
      onSelect={(v) => Number(v) !== value && onChange(Number(v) as IssuePriority)}
      options={PRIORITY_ORDER.map((p) => ({ value: String(p), label: priorityLabel[p], icon: <PriorityIcon priority={p} /> }))}
    >
      {children}
    </Picker>
  )
}
