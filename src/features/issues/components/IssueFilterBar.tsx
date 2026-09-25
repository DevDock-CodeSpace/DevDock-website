import { CircleUserRound, IterationCw, ListFilter, Tag, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { IssuePriority, IssueStatus } from '../api'
import { cycleTitle } from '../cycles'
import { FACETS, facetLabel, hasFilters, type FilterFacet, type IssueFilters } from '../filters'
import { useIssueContext } from '../hooks'
import { labelDotClass, PRIORITY_ORDER, priorityLabel, STATUS_ORDER, statusLabel } from '../meta'
import { Picker, type PickerOption } from './Picker'
import { PriorityIcon } from './PriorityIcon'
import { StatusIcon } from './StatusIcon'

const facetIcon: Record<FilterFacet, ReactNode> = {
  status: <StatusIcon status="in_progress" />,
  priority: <PriorityIcon priority={2} />,
  assignee: <CircleUserRound className="size-3.5" />,
  label: <Tag className="size-3.5" />,
  cycle: <IterationCw className="size-3.5" />,
}

/** The values a facet can take, with labels and icons (menus and chips share them). */
function useFacetOptions(): Record<FilterFacet, PickerOption[]> {
  const { members, labels, cycles, userId } = useIssueContext()
  return {
    status: STATUS_ORDER.map((s: IssueStatus) => ({ value: s, label: statusLabel[s], icon: <StatusIcon status={s} /> })),
    priority: PRIORITY_ORDER.map((p: IssuePriority) => ({
      value: String(p),
      label: priorityLabel[p],
      icon: <PriorityIcon priority={p} />,
    })),
    assignee: [
      { value: 'me', label: 'Assigned to me', icon: <CircleUserRound className="size-3.5 text-brand" /> },
      { value: 'none', label: 'No assignee', icon: <CircleUserRound className="size-3.5 text-muted-foreground" /> },
      ...members
        .filter((m) => m.user_id !== userId)
        .map((m) => ({
          value: m.user_id,
          label: m.profile?.display_name ?? 'Unnamed member',
          icon: <PersonAvatar profile={m.profile} className="size-4" />,
        })),
    ],
    label: labels.map((l) => ({
      value: l.id,
      label: l.name,
      icon: <span className={cn('size-2 rounded-full', labelDotClass[l.color])} />,
    })),
    cycle: [
      { value: 'current', label: 'Current cycle', icon: <IterationCw className="size-3.5 text-brand" /> },
      { value: 'none', label: 'No cycle', icon: <IterationCw className="size-3.5 text-muted-foreground" /> },
      ...[...cycles].reverse().map((c) => ({
        value: c.id,
        label: cycleTitle(c),
        icon: <IterationCw className="size-3.5 text-muted-foreground" />,
      })),
    ],
  }
}

type IssueFilterBarProps = {
  filters: IssueFilters
  /** An updater, so quick successive picks build on each other rather than on a stale value. */
  onChange: (update: (prev: IssueFilters) => IssueFilters) => void
  /** Controlled so the F shortcut can open it. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Facets not offered here (e.g. Cycle on a cycle's own page). */
  hideFacets?: FilterFacet[]
}

/**
 * Linear's filtering: a Filter menu with a submenu per property (checkboxes,
 * stays open), then one chip per active property ("Status is Todo, In Review")
 * that edits its values with a search, and × to remove it.
 */
export function IssueFilterBar({ filters, onChange, open, onOpenChange, hideFacets = [] }: IssueFilterBarProps) {
  const options = useFacetOptions()
  const facets = FACETS.filter((f) => !hideFacets.includes(f))
  const toggle = (facet: FilterFacet, value: string) =>
    onChange((prev) => {
      const values = prev[facet]
      return { ...prev, [facet]: values.includes(value) ? values.filter((v) => v !== value) : [...values, value] }
    })

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
            <ListFilter className="size-3.5" /> Filter
            <kbd className="ml-0.5 rounded border px-1 font-mono text-[10px]">F</kbd>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {facets.filter((f) => options[f].length > 0).map((facet) => (
            <DropdownMenuSub key={facet}>
              <DropdownMenuSubTrigger className="gap-2">
                <span className="flex size-4 items-center justify-center text-muted-foreground">{facetIcon[facet]}</span>
                {facetLabel[facet]}
                {filters[facet].length > 0 && (
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{filters[facet].length}</span>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
                {options[facet].map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={filters[facet].includes(option.value)}
                    // Keep the menu open to pick several values.
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => toggle(facet, option.value)}
                    className="gap-2"
                  >
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {facets.filter((f) => filters[f].length > 0).map((facet) => {
        const chosen = options[facet].filter((o) => filters[facet].includes(o.value))
        return (
          <div key={facet} className="flex h-7 items-center rounded-md border text-xs">
            <span className="flex items-center gap-1.5 pl-2 text-muted-foreground">
              {facetIcon[facet]}
              {facetLabel[facet]}
            </span>
            <span className="px-1 text-muted-foreground">{chosen.length > 1 ? 'is any of' : 'is'}</span>
            <Picker
              multi
              placeholder={`Filter by ${facetLabel[facet].toLowerCase()}…`}
              options={options[facet]}
              selected={filters[facet]}
              onSelect={(value) => toggle(facet, value)}
            >
              <button type="button" className="h-full max-w-56 truncate px-1.5 font-medium hover:bg-muted">
                {chosen.map((o) => o.label).join(', ') || `${filters[facet].length} selected`}
              </button>
            </Picker>
            <button
              type="button"
              aria-label={`Remove ${facetLabel[facet]} filter`}
              onClick={() => onChange((prev) => ({ ...prev, [facet]: [] }))}
              className="flex h-full items-center border-l px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
      {hasFilters(filters) && (
        <button
          type="button"
          onClick={() => onChange(() => ({ status: [], priority: [], assignee: [], label: [], cycle: [] }))}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear
        </button>
      )}
    </div>
  )
}
