import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { ChevronDown, CircleDot, LoaderCircle, NotebookPen } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Picker } from '@/features/issues/components/Picker'
import { DateField } from '@/features/live/components/DateField'
import { TimeSelect } from '@/features/live/components/TimeSelect'
import { issueIdentifier } from '@/features/issues/meta'
import { fromLocalInputs, toLocalInputs } from '@/features/live/time'
import { useCurrentTeam } from '@/features/teams/hooks'
import { workspaceTypes } from '@/features/teams/permissions'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import { NOTES_MAX, reminderInputProblem, reminderIssueOptionsQuery, TITLE_MAX, type IssueOption, type Reminder } from '../api'
import { useCreateReminder, useUpdateReminder } from '../hooks'
import { defaultRemindAt, formatReminderWhen, quickTimes } from '../when'

const NO_WORKSPACE = 'none'
const NO_ISSUE = 'none'

/** What a new reminder starts with when it's created from somewhere (an issue page). */
export type ReminderDefaults = {
  /** Start with "show at a time" on (the issue page's alarm button). A plain new note starts off. */
  remind?: boolean
  workspaceId: string
  issueId?: string
  /** "CAP-12 Login bug", so the picker can show it without loading the issue list. */
  issueLabel?: string
}

type ReminderDialogProps = {
  /** Edit this reminder instead of creating one. */
  reminder?: Reminder
  defaults?: ReminderDefaults
  /** Custom trigger (defaults to a "New note" button). Ignored when controlled. */
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * New or edit note: a title, details, optionally a time at which it pops up (quick times or a date
 * and time) and optionally a workspace and an issue in it. Times are entered and shown in the
 * browser's time zone and saved as an instant.
 */
export function ReminderDialog({ reminder, defaults, children, open: controlledOpen, onOpenChange }: ReminderDialogProps) {
  const { team } = useCurrentTeam()
  // Personal, so every workspace the person can open in the group, not only the collection in view.
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const create = useCreateReminder()
  const update = useUpdateReminder()
  const editing = reminder !== undefined
  const save = editing ? update : create

  const initial = () => {
    const { date, time } = toLocalInputs(reminder?.remind_at ? new Date(reminder.remind_at) : defaultRemindAt(Date.now()))
    const workspaceId = reminder?.workspace_id ?? defaults?.workspaceId ?? null
    const issueKey = reminder?.workspace?.issue_key
    return {
      title: reminder?.title ?? '',
      notes: reminder?.notes ?? '',
      remind: reminder ? reminder.remind_at !== null : (defaults?.remind ?? false),
      date,
      time,
      workspaceId,
      issueId: reminder?.issue_id ?? defaults?.issueId ?? null,
      issueLabel:
        reminder?.issue && issueKey
          ? `${issueIdentifier(issueKey, reminder.issue.number)} ${reminder.issue.title}`
          : (defaults?.issueLabel ?? null),
    }
  }
  const [innerOpen, setInnerOpen] = useState(false)
  const open = controlledOpen ?? innerOpen
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInnerOpen(next)
    onOpenChange?.(next)
  }
  const [form, setForm] = useState(initial)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const [now] = useState(Date.now)

  // No time chosen (the box is off) is a note that never pops up.
  const at = form.remind ? fromLocalInputs(form.date, form.time) : null
  const workspace = workspaces.find((w) => w.id === form.workspaceId)
  const problem = reminderInputProblem({ title: form.title, notes: form.notes, remindAt: at?.toISOString() ?? null }) ?? (form.remind && !at ? 'Pick a date and time.' : null)
  const firedBefore = editing && reminder.notified_at !== null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (problem) return
    const input = {
      title: form.title,
      notes: form.notes,
      remindAt: at?.toISOString() ?? null,
      workspaceId: form.workspaceId,
      issueId: form.issueId,
    }
    const done = {
      onSuccess: () => {
        setOpen(false)
        toast.success(input.remindAt ? `Note saved. It will show up ${formatReminderWhen(input.remindAt, Date.now()).toLowerCase()}.` : 'Note saved.')
      },
      onError: (error: unknown) => toast.error(errorMessage(error)),
    }
    if (editing) update.mutate({ id: reminder.id, patch: input }, done)
    else create.mutate({ ...input, teamId: team.id }, done)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (save.isPending) return
        setOpen(next)
        if (next) setForm(initial())
        else save.reset()
      }}
    >
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          {children ?? (
            <Button size="sm">
              <NotebookPen /> New note
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-lg">
        <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit note' : 'New note'}</DialogTitle>
            <DialogDescription>Only you can see it. Pick a time if you want it to pop up then; otherwise it stays a note.</DialogDescription>
          </DialogHeader>

          <div className="-mr-2 min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-title">Note</Label>
              <Input
                id="reminder-title"
                value={form.title}
                maxLength={TITLE_MAX}
                placeholder="Review the login PR"
                onChange={(e) => set('title', e.target.value)}
                required
                autoFocus
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={form.remind}
                onChange={(e) => set('remind', e.target.checked)}
                className="size-4 accent-brand"
              />
              Show this note to me at a set time
            </label>

            {form.remind && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick times">
                {quickTimes(now).map((quick) => {
                  const inputs = toLocalInputs(quick.at)
                  const active = inputs.date === form.date && inputs.time === form.time
                  return (
                    <button
                      key={quick.label}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setForm((f) => ({ ...f, ...inputs }))}
                      className={
                        active
                          ? 'rounded-md border border-brand/40 bg-brand/10 px-2 py-1 text-xs font-medium text-foreground'
                          : 'rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
                      }
                    >
                      {quick.label}
                    </button>
                  )
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reminder-date">Date</Label>
                  <DateField id="reminder-date" value={form.date} onChange={(value) => set('date', value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reminder-time">Time</Label>
                  <TimeSelect id="reminder-time" value={form.time} onChange={(value) => set('time', value)} />
                </div>
              </div>
              <p className="font-mono text-xs text-muted-foreground" aria-live="polite">
                {at ? formatReminderWhen(at.toISOString(), now) : 'Pick a date and time.'}
                {at && at.getTime() <= now && ' · in the past, it will show up right away'}
                {firedBefore && at && at.getTime() > now && at.toISOString() !== new Date(reminder.remind_at ?? 0).toISOString() &&
                  ' · it will show up again then'}
              </p>
            </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reminder-workspace">Workspace</Label>
                <Select
                  value={form.workspaceId ?? NO_WORKSPACE}
                  onValueChange={(value) => {
                    // Radix reports '' when its options change under it; that isn't a choice.
                    if (!value) return
                    const next = value === NO_WORKSPACE ? null : value
                    if (next !== form.workspaceId) setForm((f) => ({ ...f, workspaceId: next, issueId: null, issueLabel: null }))
                  }}
                >
                  <SelectTrigger id="reminder-workspace" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_WORKSPACE}>
                      <span className="text-muted-foreground">None</span>
                    </SelectItem>
                    {workspaces.map((w) => {
                      const Icon = workspaceTypes[w.type].icon
                      return (
                        <SelectItem key={w.id} value={w.id}>
                          <Icon className="text-muted-foreground" />
                          {w.title}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Issue</Label>
                {workspace?.modules.includes('issues') || form.issueId ? (
                  <IssueField
                    workspaceId={form.workspaceId}
                    label={form.issueLabel}
                    selected={form.issueId}
                    onChange={(issueId, issueLabel) => setForm((f) => ({ ...f, issueId, issueLabel }))}
                  />
                ) : (
                  <p className="flex h-9 items-center text-xs text-muted-foreground">
                    {form.workspaceId ? 'This workspace has no issues.' : 'Pick a workspace to link an issue.'}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reminder-notes">Details</Label>
              <Textarea
                id="reminder-notes"
                value={form.notes}
                maxLength={NOTES_MAX}
                rows={3}
                placeholder="Anything you'll want to remember"
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!!problem || save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              {editing ? 'Save changes' : 'Save note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Picks an issue in the workspace. Its list loads only when the picker is opened. */
function IssueField({
  workspaceId,
  label,
  selected,
  onChange,
}: {
  workspaceId: string | null
  label: string | null
  selected: string | null
  onChange: (issueId: string | null, label: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const options = useQuery({ ...reminderIssueOptionsQuery(workspaceId ?? ''), enabled: open && workspaceId !== null })
  const issues = options.data?.issues ?? []
  const labelOf = (issue: IssueOption) => `${issueIdentifier(options.data?.key ?? '', issue.number)} ${issue.title}`

  return (
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder={options.isPending && open ? 'Loading issues…' : 'Find an issue…'}
      selected={selected ? [selected] : [NO_ISSUE]}
      options={[
        { value: NO_ISSUE, label: 'No issue' },
        ...issues.map((issue) => ({ value: issue.id, label: labelOf(issue) })),
      ]}
      onSelect={(value) => {
        if (value === NO_ISSUE) return onChange(null, null)
        const issue = issues.find((i) => i.id === value)
        if (issue) onChange(issue.id, labelOf(issue))
      }}
    >
      <Button type="button" variant="outline" className="w-full justify-between font-normal">
        <span className="flex min-w-0 items-center gap-2">
          <CircleDot className="size-4 shrink-0 text-muted-foreground" />
          <span className={label ? 'truncate' : 'truncate text-muted-foreground'}>{label ?? 'No issue'}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>
    </Picker>
  )
}
