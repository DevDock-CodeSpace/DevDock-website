import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { localDateISO } from '@/lib/format'
import { createCycle, issueKeys, updateCycle, type IssueCycle } from '../api'
import { addDays, cycleTitle, daysBetween } from '../cycles'
import { useIssueContext } from '../hooks'

const LENGTHS = [7, 14, 21]

/** New cycle (starts the day after the last one ends, 2 weeks long) or edit an existing one. Managers only. */
export function CycleDialog({
  open,
  onOpenChange,
  cycle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this cycle; omit to create. */
  cycle?: IssueCycle
}) {
  const { workspace, cycles } = useIssueContext()
  const queryClient = useQueryClient()
  const [today] = useState(() => localDateISO(new Date()))

  const defaultStart = () => {
    const last = cycles.at(-1)
    return last && last.ends_on >= today ? addDays(last.ends_on, 1) : today
  }
  const [name, setName] = useState(cycle?.name ?? '')
  const [startsOn, setStartsOn] = useState(cycle?.starts_on ?? defaultStart)
  const [endsOn, setEndsOn] = useState(cycle?.ends_on ?? addDays(startsOn, 13))
  const length = daysBetween(startsOn, endsOn) + 1

  const save = useMutation({
    mutationFn: async () => {
      if (cycle) await updateCycle(cycle.id, { name, startsOn, endsOn })
      else await createCycle(workspace.id, { name, startsOn, endsOn })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: issueKeys.cycles(workspace.id) })
      onOpenChange(false)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (startsOn && endsOn && !save.isPending) save.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{cycle ? `Edit ${cycleTitle(cycle)}` : 'New cycle'}</DialogTitle>
            <DialogDescription>
              A time-boxed stretch of work (a sprint). Put issues in it from their Cycle property. Cycles can’t overlap.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cycle-name">
              Name <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="cycle-name"
              value={name}
              maxLength={80}
              placeholder="Auth sprint"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cycle-start">Starts</Label>
              <Input
                id="cycle-start"
                type="date"
                required
                value={startsOn}
                className="dark:scheme-dark"
                onChange={(e) => {
                  const next = e.target.value
                  // Keep the length when the start moves.
                  if (next && startsOn) setEndsOn(addDays(next, length - 1))
                  setStartsOn(next)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cycle-end">Ends</Label>
              <Input
                id="cycle-end"
                type="date"
                required
                value={endsOn}
                min={startsOn}
                className="dark:scheme-dark"
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Length</span>
            {LENGTHS.map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={length === days ? 'secondary' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setEndsOn(addDays(startsOn, days - 1))}
              >
                {days / 7} {days === 7 ? 'week' : 'weeks'}
              </Button>
            ))}
            {!LENGTHS.includes(length) && length > 0 && (
              <span className="font-mono text-xs text-muted-foreground">{length} days</span>
            )}
          </div>
          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!startsOn || !endsOn || save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              {cycle ? 'Save' : 'Create cycle'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
