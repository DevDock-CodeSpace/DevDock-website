import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { LoaderCircle, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { SettingsSection } from '@/components/SettingsSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import { updateIssueKey } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import {
  createLabel,
  deleteLabel,
  issueKeys,
  labelsQuery,
  updateLabel,
  type IssueLabel,
  type LabelColor,
} from '../api'
import { LABEL_COLORS, labelDotClass } from '../meta'

const KEY_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/

/** Workspace settings → Issues: the identifier prefix and the label set. Managers only (the page checks). */
export function IssueSettingsSection() {
  const { workspace } = useCurrentWorkspace()
  const labels = useSuspenseQuery(labelsQuery(workspace.id)).data
  const queryClient = useQueryClient()

  const [key, setKey] = useState(workspace.issue_key)
  const saveKey = useMutation({
    mutationFn: () => updateIssueKey(workspace.id, key),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces', workspace.id] })
      toast.success(`Issues are now ${key}-1, ${key}-2, …`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const keyValid = KEY_PATTERN.test(key)

  const [newName, setNewName] = useState('')
  const refreshLabels = () => queryClient.invalidateQueries({ queryKey: issueKeys.labels(workspace.id) })
  const addLabel = useMutation({
    mutationFn: () => createLabel(workspace.id, newName, LABEL_COLORS[(labels.length + 1) % LABEL_COLORS.length]),
    onSuccess: async () => {
      setNewName('')
      await refreshLabels()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <SettingsSection
      title="Issues"
      description="The prefix of issue IDs, and the labels everyone in this workspace can put on issues."
    >
      <form
        className="space-y-1.5"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (keyValid && key !== workspace.issue_key) saveKey.mutate()
        }}
      >
        <Label htmlFor="issue-key">Issue key</Label>
        <div className="flex gap-2">
          <Input
            id="issue-key"
            value={key}
            maxLength={6}
            onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            className="w-32 font-mono uppercase"
            aria-invalid={!keyValid}
          />
          <Button type="submit" variant="outline" disabled={!keyValid || key === workspace.issue_key || saveKey.isPending}>
            {saveKey.isPending && <LoaderCircle className="animate-spin" />}
            Save
          </Button>
        </div>
        <p className={cn('text-xs', keyValid ? 'text-muted-foreground' : 'text-destructive')}>
          {keyValid
            ? `IDs look like ${key}-12. Changing it renames every issue's ID.`
            : '2–6 letters or digits, starting with a letter.'}
        </p>
      </form>

      <div className="mt-8 space-y-2">
        <Label>Labels</Label>
        <ul className="divide-y rounded-md border">
          {labels.map((label) => (
            <LabelRow key={label.id} label={label} onChanged={refreshLabels} />
          ))}
          <li>
            <form
              className="flex items-center gap-2 px-2 py-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                if (newName.trim()) addLabel.mutate()
              }}
            >
              <Plus className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={newName}
                maxLength={40}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New label"
                aria-label="New label name"
                className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {newName.trim() && (
                <Button type="submit" size="sm" variant="secondary" disabled={addLabel.isPending}>
                  Add
                </Button>
              )}
            </form>
          </li>
        </ul>
      </div>
    </SettingsSection>
  )
}

function LabelRow({ label, onChanged }: { label: IssueLabel; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(label.name)
  const save = useMutation({
    mutationFn: (input: { name: string; color: LabelColor }) => updateLabel(label.id, input),
    onSuccess: onChanged,
    onError: (error) => {
      setName(label.name)
      toast.error(errorMessage(error))
    },
  })
  const remove = useMutation({
    mutationFn: () => deleteLabel(label.id),
    onSuccess: onChanged,
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <li className="group flex items-center gap-2 px-2 py-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Color: ${label.color}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
          >
            <span className={cn('size-2.5 rounded-full', labelDotClass[label.color])} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-auto gap-1.5 p-2">
          {LABEL_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => color !== label.color && save.mutate({ name: label.name, color })}
              className={cn(
                'size-5 rounded-full',
                labelDotClass[color],
                color === label.color && 'ring-2 ring-brand ring-offset-2 ring-offset-popover',
              )}
            />
          ))}
        </PopoverContent>
      </Popover>
      <input
        value={name}
        maxLength={40}
        aria-label="Label name"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (!name.trim()) setName(label.name)
          else if (name.trim() !== label.name) save.mutate({ name, color: label.color })
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-7 min-w-0 flex-1 rounded-sm bg-transparent px-1 text-sm outline-none focus:bg-muted/50"
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete label ${label.name}`}
        className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
        onClick={() => remove.mutate()}
        disabled={remove.isPending}
      >
        <Trash2 />
      </Button>
    </li>
  )
}
