import type { ReactNode } from 'react'
import type { IssueStatus } from '../api'
import { STATUS_ORDER, statusLabel } from '../meta'
import { Picker } from './Picker'
import { StatusIcon } from './StatusIcon'

export function StatusPicker({
  value,
  onChange,
  children,
  align,
  open,
  onOpenChange,
}: {
  value: IssueStatus
  onChange: (status: IssueStatus) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <Picker
      open={open}
      onOpenChange={onOpenChange}
      placeholder="Change status…"
      align={align}
      selected={[value]}
      onSelect={(v) => v !== value && onChange(v as IssueStatus)}
      options={STATUS_ORDER.map((s) => ({ value: s, label: statusLabel[s], icon: <StatusIcon status={s} /> }))}
    >
      {children}
    </Picker>
  )
}
