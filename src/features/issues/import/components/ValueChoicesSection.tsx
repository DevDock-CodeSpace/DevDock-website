import type { ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { WorkspaceMember } from '@/features/workspaces/api'
import type { IssueCycle } from '../../api'
import { PriorityIcon } from '../../components/PriorityIcon'
import { StatusIcon } from '../../components/StatusIcon'
import { cycleTitle } from '../../cycles'
import { PRIORITY_ORDER, priorityLabel, STATUS_ORDER, statusLabel } from '../../meta'
import { KEEP_NAME, NEW_SPRINT, type ChoiceField, type ValueChoices } from '../build'
import type { FileSprint } from '../values'

export type ChoiceGroup = { field: ChoiceField; values: { value: string; count: number; matched: boolean }[] }

const TITLES: Record<ChoiceField, string> = { status: 'Statuses', priority: 'Priorities', assignee: 'People', sprint: 'Sprints' }
const NONE = 'none'

const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
const shortDay = (date: string) => day.format(new Date(`${date}T00:00:00Z`))

/** "New: Sprint 35 · Oct 8 – Oct 21" (the number is the file's when it's free in the project). */
function newSprintLabel(sprint: FileSprint) {
  const title = sprint.number === null ? 'New sprint' : `New: Sprint ${sprint.number}`
  return `${title}${sprint.name ? ` · ${sprint.name}` : ''} · ${shortDay(sprint.starts_on)} – ${shortDay(sprint.ends_on)}`
}

// Plain selects rather than the issue pickers: the pickers (and avatars) in this lazy chunk made
// the bundler split code the first load already has into extra shared chunks (+3.5 KB first load).
function ChoiceSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: ReactNode }[]; onChange: (value: string) => void }) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        // Radix reports '' when its options change under it.
        if (v !== '') onChange(v)
      }}
    >
      <SelectTrigger aria-label={label} className="h-7 w-64 max-w-[60vw] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** What each status, priority, person and sprint in the file becomes. */
export function ValueChoicesSection({
  groups,
  choices,
  onChange,
  members,
  cycles,
  fileSprints,
}: {
  groups: ChoiceGroup[]
  choices: ValueChoices
  onChange: (field: ChoiceField, value: string, choice: string | number | null) => void
  members: WorkspaceMember[]
  cycles: IssueCycle[]
  /** Sprints the file describes with dates, which the import can create. */
  fileSprints: Map<string, FileSprint>
}) {
  const shown = groups.filter((g) => g.values.length > 0)
  if (shown.length === 0) return null

  const control = (field: ChoiceField, value: string) => {
    const label = `${TITLES[field]}: ${value || 'Empty'}`
    if (field === 'status') {
      return (
        <ChoiceSelect
          label={label}
          value={choices.status[value] ?? 'todo'}
          onChange={(v) => onChange(field, value, v)}
          options={STATUS_ORDER.map((s) => ({ value: s, label: <span className="inline-flex items-center gap-1.5"><StatusIcon status={s} /> {statusLabel[s]}</span> }))}
        />
      )
    }
    if (field === 'priority') {
      return (
        <ChoiceSelect
          label={label}
          value={String(choices.priority[value] ?? 0)}
          onChange={(v) => onChange(field, value, Number(v))}
          options={PRIORITY_ORDER.map((p) => ({ value: String(p), label: <span className="inline-flex items-center gap-1.5"><PriorityIcon priority={p} /> {priorityLabel[p]}</span> }))}
        />
      )
    }
    if (field === 'assignee') {
      return (
        <ChoiceSelect
          label={label}
          value={choices.assignee[value] ?? NONE}
          onChange={(v) => onChange(field, value, v === NONE ? null : v)}
          options={[
            { value: KEEP_NAME, label: <span className="text-muted-foreground">Keep the name until matched</span> },
            { value: NONE, label: <span className="text-muted-foreground">No assignee</span> },
            ...members.map((m) => ({ value: m.user_id, label: m.profile?.display_name ?? 'Unnamed' })),
          ]}
        />
      )
    }
    const fromFile = fileSprints.get(value)
    return (
      <ChoiceSelect
        label={label}
        value={choices.sprint[value] ?? NONE}
        onChange={(v) => onChange(field, value, v === NONE ? null : v)}
        options={[
          ...(fromFile ? [{ value: NEW_SPRINT, label: newSprintLabel(fromFile) }] : []),
          { value: NONE, label: <span className="text-muted-foreground">No sprint</span> },
          ...cycles.map((c) => ({ value: c.id, label: cycleTitle(c) })),
        ]}
      />
    )
  }

  return (
    <section aria-labelledby="import-values">
      <h2 id="import-values" className="text-sm font-semibold">Values</h2>
      <p className="mt-1 text-sm text-muted-foreground">What each value in the file becomes in Calsko. The ones we couldn’t match are marked.</p>
      <div className="mt-3 grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {shown.map(({ field, values }) => (
          <div key={field}>
            <h3 className="text-xs font-medium text-muted-foreground">{TITLES[field]}</h3>
            <div className="mt-1.5 divide-y border-y">
              {values.map(({ value, count, matched }) => (
                <div key={value} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <span className="block truncate text-sm" title={value}>{value || <span className="text-muted-foreground">Empty</span>}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono">{count}</span> {count === 1 ? 'issue' : 'issues'}
                      {!matched && value && (
                        // People and sprints the file describes come in anyway; only other misses need a look.
                        field === 'assignee' ? <span> · Not in this project</span>
                        : field === 'sprint' && fileSprints.has(value) ? <span> · New, from the file</span>
                        : <span className="text-amber-600 dark:text-amber-400"> · Not matched</span>
                      )}
                    </span>
                  </div>
                  <div className="shrink-0">{control(field, value)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
