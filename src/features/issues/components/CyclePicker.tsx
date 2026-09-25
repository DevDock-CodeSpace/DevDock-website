import { IterationCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatShortDate, localDateISO } from '@/lib/format'
import type { IssueCycle } from '../api'
import { cycleState, cycleTitle } from '../cycles'
import { Picker } from './Picker'

const NONE = 'none'

/** Put an issue in a cycle: current and upcoming ones (plus its own, if past), or none. */
export function CyclePicker({
  value,
  cycles,
  onChange,
  children,
  align,
  open,
  onOpenChange,
}: {
  value: string | null
  cycles: IssueCycle[]
  onChange: (cycleId: string | null) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [today] = useState(() => localDateISO(new Date()))
  const shown = cycles.filter((c) => c.id === value || cycleState(c, today) !== 'past')
  return (
    <Picker
      open={open}
      onOpenChange={onOpenChange}
      placeholder="Move to cycle…"
      align={align}
      selected={[value ?? NONE]}
      onSelect={(v) => {
        const next = v === NONE ? null : v
        if (next !== value) onChange(next)
      }}
      options={[
        { value: NONE, label: 'No cycle', icon: <IterationCw className="size-3.5 text-muted-foreground" /> },
        ...shown.map((c) => ({
          value: c.id,
          label: `${cycleTitle(c)}${cycleState(c, today) === 'current' ? ' (current)' : ''} · ${formatShortDate(c.starts_on)} – ${formatShortDate(c.ends_on)}`,
          icon: <IterationCw className="size-3.5 text-brand" />,
        })),
      ]}
    >
      {children}
    </Picker>
  )
}
