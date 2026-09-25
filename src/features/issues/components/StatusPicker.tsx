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
}: {
  value: IssueStatus
  onChange: (status: IssueStatus) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <Picker
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
