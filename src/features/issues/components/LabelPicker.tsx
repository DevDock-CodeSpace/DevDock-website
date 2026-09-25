import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { createLabel, issueKeys, type IssueLabel } from '../api'
import { LABEL_COLORS, labelDotClass } from '../meta'
import { Picker } from './Picker'

/**
 * Toggle labels on an issue. Workspace managers can also create a label by
 * typing a new name (it gets the next color in turn).
 */
export function LabelPicker({
  workspaceId,
  value,
  labels,
  canCreate,
  onChange,
  children,
  align,
  open,
  onOpenChange,
}: {
  workspaceId: string
  value: string[]
  labels: IssueLabel[]
  canCreate: boolean
  onChange: (labelIds: string[]) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const create = async (name: string) => {
    try {
      const color = LABEL_COLORS[(labels.length + 1) % LABEL_COLORS.length]
      const label = await createLabel(workspaceId, name, color)
      await queryClient.invalidateQueries({ queryKey: issueKeys.labels(workspaceId) })
      onChange([...value, label.id])
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <Picker
      open={open}
      onOpenChange={onOpenChange}
      multi
      placeholder={canCreate ? 'Add labels, or type to create…' : 'Add labels…'}
      align={align}
      selected={value}
      onSelect={(id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])}
      onCreate={canCreate ? (name) => void create(name) : undefined}
      options={labels.map((l) => ({
        value: l.id,
        label: l.name,
        icon: <span className={cn('size-2 shrink-0 rounded-full', labelDotClass[l.color])} />,
      }))}
    >
      {children}
    </Picker>
  )
}
