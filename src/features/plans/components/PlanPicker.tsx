import { Goal } from 'lucide-react'
import type { ReactNode } from 'react'
import { Picker } from '@/features/issues/components/Picker'
import type { Plan } from '../api'
import { isPlanOpen, sortPlans } from '../meta'
import { PlanStatusDot } from './PlanStatusDot'

const NONE = 'none'

/** Put an issue in a plan: the group's open plans (plus its own, if closed), or none. */
export function PlanPicker({
  value,
  plans,
  onChange,
  children,
  align,
  open,
  onOpenChange,
}: {
  value: string | null
  plans: Plan[]
  onChange: (planId: string | null) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const shown = sortPlans(plans.filter((p) => p.id === value || isPlanOpen(p)))
  return (
    <Picker
      open={open}
      onOpenChange={onOpenChange}
      placeholder="Add to plan…"
      align={align}
      selected={[value ?? NONE]}
      onSelect={(v) => {
        const next = v === NONE ? null : v
        if (next !== value) onChange(next)
      }}
      options={[
        { value: NONE, label: 'No plan', icon: <Goal className="size-3.5 text-muted-foreground" /> },
        ...shown.map((p) => ({ value: p.id, label: p.name, icon: <PlanStatusDot status={p.status} /> })),
      ]}
    >
      {children}
    </Picker>
  )
}
