import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, CircleUserRound, IterationCw, LoaderCircle, Tag } from 'lucide-react'
import { useState, type ComponentProps, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PersonAvatar } from '@/components/PersonRow'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useCurrentTeam } from '@/features/teams/hooks'
import { issuePath } from '@/features/teams/nav'
import type { Json } from '@/types/database.types'
import { createIssue, issueKeys, type Issue, type IssuePriority, type IssueStatus } from '../api'
import { cycleTitle } from '../cycles'
import { useIssueContext } from '../hooks'
import { issueIdentifier, priorityLabel, statusLabel } from '../meta'
import { AssigneePicker } from './AssigneePicker'
import { CyclePicker } from './CyclePicker'
import { LabelChip } from './LabelChip'
import { LabelPicker } from './LabelPicker'
import { PriorityIcon } from './PriorityIcon'
import { PriorityPicker } from './PriorityPicker'
import { StatusIcon } from './StatusIcon'
import { StatusPicker } from './StatusPicker'

/** Plain text → a TipTap doc (one paragraph per line), the format descriptions are stored in. */
function textToDoc(text: string): Json | null {
  if (!text.trim()) return null
  return {
    type: 'doc',
    content: text.split('\n').map((line) =>
      line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
    ),
  }
}

type CreateIssueDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Starting status (e.g. the list group or board column it was opened from). */
  status?: IssueStatus
  /** Creates a sub-issue of this issue. */
  parent?: Pick<Issue, 'id' | 'number' | 'title'>
  /** Starting cycle (e.g. opened from a cycle's page). */
  cycleId?: string | null
}

/** Linear's "New issue" modal: title, description, and property chips. ⌘/Ctrl+Enter creates. */
export function CreateIssueDialog({
  open,
  onOpenChange,
  status: initialStatus = 'todo',
  parent,
  cycleId: initialCycle = null,
}: CreateIssueDialogProps) {
  const { team } = useCurrentTeam()
  const { workspace, members, labels, cycles, canManage, userId } = useIssueContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<IssueStatus>(initialStatus)
  const [priority, setPriority] = useState<IssuePriority>(0)
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [cycleId, setCycleId] = useState<string | null>(initialCycle)

  const reset = () => {
    setTitle('')
    setDescription('')
    setStatus(initialStatus)
    setPriority(0)
    setAssigneeId(null)
    setLabelIds([])
    setCycleId(initialCycle)
  }

  const create = useMutation({
    mutationFn: () =>
      createIssue({
        workspaceId: workspace.id,
        title,
        description: textToDoc(description),
        status,
        priority,
        assigneeId,
        parentId: parent?.id ?? null,
        cycleId,
        labelIds,
      }),
    onSuccess: async ({ number }) => {
      await queryClient.invalidateQueries({ queryKey: issueKeys.all })
      const id = issueIdentifier(workspace.issue_key, number)
      toast.success(`${id} created`, {
        description: title.trim(),
        action: { label: 'View', onClick: () => void navigate(issuePath(team.slug, workspace.id, number)) },
      })
      reset()
      onOpenChange(false)
    },
  })

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (title.trim() && !create.isPending) create.mutate()
  }

  const assignee = members.find((m) => m.user_id === assigneeId)
  const chosenLabels = labels.filter((l) => labelIds.includes(l.id))
  const cycle = cycles.find((c) => c.id === cycleId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) create.reset()
      }}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-2xl" showCloseButton={false}>
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
        >
          <div className="flex items-center gap-1.5 px-5 pt-4 text-xs text-muted-foreground">
            <span className="rounded border px-1.5 py-0.5 font-mono">{workspace.issue_key}</span>
            <ChevronRight className="size-3" />
            <DialogTitle className="text-xs font-normal text-foreground">
              {parent ? `New sub-issue of ${issueIdentifier(workspace.issue_key, parent.number)}` : 'New issue'}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">Create an issue in {workspace.title}.</DialogDescription>
          <div className="px-5 pt-3">
            <input
              autoFocus
              value={title}
              maxLength={300}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Issue title"
              aria-label="Issue title"
              className="w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground/60"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description…"
              aria-label="Description"
              rows={4}
              className="mt-2 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-5 pb-4">
            <StatusPicker value={status} onChange={setStatus}>
              <Chip>
                <StatusIcon status={status} />
                {statusLabel[status]}
              </Chip>
            </StatusPicker>
            <PriorityPicker value={priority} onChange={setPriority}>
              <Chip>
                <PriorityIcon priority={priority} />
                {priority === 0 ? 'Priority' : priorityLabel[priority]}
              </Chip>
            </PriorityPicker>
            <AssigneePicker value={assigneeId} members={members} userId={userId} onChange={setAssigneeId}>
              <Chip>
                {assignee ? (
                  <PersonAvatar profile={assignee.profile} className="size-4" />
                ) : (
                  <CircleUserRound className="size-3.5 text-muted-foreground" />
                )}
                {assignee ? (assignee.profile?.display_name ?? 'Unnamed member') : 'Assignee'}
              </Chip>
            </AssigneePicker>
            <LabelPicker
              workspaceId={workspace.id}
              value={labelIds}
              labels={labels}
              canCreate={canManage}
              onChange={setLabelIds}
            >
              <Chip>
                {chosenLabels.length === 0 ? (
                  <>
                    <Tag className="size-3.5 text-muted-foreground" /> Labels
                  </>
                ) : (
                  chosenLabels.map((l) => <LabelChip key={l.id} label={l} className="h-4 border-0 px-0" />)
                )}
              </Chip>
            </LabelPicker>
            {cycles.length > 0 && (
              <CyclePicker value={cycleId} cycles={cycles} onChange={setCycleId}>
                <Chip>
                  <IterationCw className="size-3.5 text-muted-foreground" />
                  {cycle ? cycleTitle(cycle) : 'Cycle'}
                </Chip>
              </CyclePicker>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
            <p role="alert" className="min-w-0 truncate text-sm text-destructive">
              {create.isError ? create.error.message : null}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!title.trim() || create.isPending}>
                {create.isPending && <LoaderCircle className="animate-spin" />}
                Create issue
                <kbd className="ml-1 font-mono text-[10px] opacity-70">⌘↵</kbd>
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A property button in the create modal's chip row. */
function Chip({ children, ...props }: { children: ReactNode } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
    >
      {children}
    </button>
  )
}
