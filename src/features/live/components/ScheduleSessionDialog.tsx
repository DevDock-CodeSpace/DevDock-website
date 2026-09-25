import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { CalendarPlus, Globe, LoaderCircle } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
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
import { useCurrentTeam } from '@/features/teams/hooks'
import { liveSessionPath } from '@/features/teams/nav'
import { workspaceTypes } from '@/features/teams/permissions'
import { teamWorkspacesQuery } from '@/features/workspaces/api'
import { errorMessage } from '@/lib/errors'
import { createLiveSession, updateLiveSession, type LiveSession } from '../api'
import { useCalendarOps, useCanWriteLive } from '../hooks'
import { durationMinutes, formatDuration, fromLocalInputs, nextFullHour, toLocalInputs } from '../time'

const GROUP_WIDE = 'group'
const DURATIONS = [30, 45, 60, 90, 120, 180]

type ScheduleSessionDialogProps = {
  /** Fixes the scope to this workspace (inside a workspace's Live tab). */
  workspaceId?: string
  /** Edit this session instead of scheduling a new one. */
  session?: LiveSession
  /** Custom trigger (defaults to a "Schedule session" button). */
  children?: ReactNode
}

/**
 * Schedule (or edit) a live session: title, audience, date, time, length,
 * notes, and whether to put it in the organizer's Google Calendar with
 * everyone in the audience invited. Only offered in scopes the user may write to.
 */
export function ScheduleSessionDialog({ workspaceId, session, children }: ScheduleSessionDialogProps) {
  const { team } = useCurrentTeam()
  const workspaces = useSuspenseQuery(teamWorkspacesQuery(team.id)).data
  const canWrite = useCanWriteLive()
  const calendarOps = useCalendarOps()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const editing = session !== undefined

  const scopes = editing
    ? []
    : workspaceId
      ? canWrite(workspaceId)
        ? [workspaceId]
        : []
      : [...(canWrite(null) ? [GROUP_WIDE] : []), ...workspaces.filter((w) => canWrite(w.id)).map((w) => w.id)]

  const initial = () => {
    const start = session ? new Date(session.starts_at) : nextFullHour(Date.now())
    const { date, time } = toLocalInputs(start)
    return {
      title: session?.title ?? '',
      description: session?.description ?? '',
      date,
      time,
      duration: session ? durationMinutes(session) : 60,
      scope: scopes[0] ?? GROUP_WIDE,
      // New sessions go to the calendar by default; edits update an existing invite.
      calendar: session ? session.calendar_event_id !== null : true,
    }
  }
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initial)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))

  const start = fromLocalInputs(form.date, form.time)
  const durations = DURATIONS.includes(form.duration) ? DURATIONS : [...DURATIONS, form.duration].sort((a, b) => a - b)

  const save = useMutation({
    mutationFn: async () => {
      if (!start) throw new Error('Pick a valid date and time.')
      const input = {
        title: form.title,
        description: form.description,
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + form.duration * 60_000).toISOString(),
      }
      let id: string
      let sessionWorkspace: string | null
      if (session) {
        await updateLiveSession(session.id, input)
        id = session.id
        sessionWorkspace = session.workspace_id
      } else {
        sessionWorkspace = form.scope === GROUP_WIDE ? null : form.scope
        id = (await createLiveSession({ ...input, teamId: team.id, workspaceId: sessionWorkspace })).id
      }
      // Where the calendar event links to (members of the audience can open it there).
      const url = `${window.location.origin}${liveSessionPath(team.slug, id, sessionWorkspace ?? undefined)}`
      // Where the organizer lands (the view they scheduled from).
      const returnTo = liveSessionPath(team.slug, id, workspaceId)
      await queryClient.invalidateQueries({ queryKey: ['live'] })
      if (!form.calendar) return { id, returnTo, calendar: 'skipped' as const }
      try {
        const result = await calendarOps([{ kind: 'sync', sessionId: id, url }], returnTo)
        return { id, returnTo, calendar: result }
      } catch (error) {
        // The session is saved either way; say what didn't happen.
        toast.error(errorMessage(error))
        return { id, returnTo, calendar: 'failed' as const }
      }
    },
    onSuccess: ({ returnTo, calendar }) => {
      // Leaving for Google: the queued sync finishes when they come back.
      if (calendar === 'redirecting') return
      setOpen(false)
      if (calendar === 'done') toast.success(editing ? 'Session and calendar invite updated.' : 'Session scheduled. Calendar invites sent.')
      else if (calendar === 'skipped') toast.success(editing ? 'Session updated.' : 'Session scheduled.')
      if (!editing) navigate(returnTo)
    },
  })

  if (!editing && scopes.length === 0) return null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (form.title.trim() && start) save.mutate()
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
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm">
            <CalendarPlus /> Schedule session
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit session' : 'Schedule a live session'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Changes are sent to everyone invited when the calendar invite is updated.'
                : 'A video call in DevDock. Everyone it’s for can see it here and join from the session page.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="live-title">Title</Label>
            <Input
              id="live-title"
              value={form.title}
              maxLength={200}
              placeholder="Week 3: REST APIs live coding"
              onChange={(e) => set('title', e.target.value)}
              required
              autoFocus
            />
          </div>

          {!editing && !workspaceId && (
            <div className="space-y-1.5">
              <Label htmlFor="live-scope">For</Label>
              <Select value={form.scope} onValueChange={(value) => set('scope', value)}>
                <SelectTrigger id="live-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scopes.map((id) => {
                    if (id === GROUP_WIDE) {
                      return (
                        <SelectItem key={id} value={id}>
                          <Globe className="text-muted-foreground" />
                          Whole group
                        </SelectItem>
                      )
                    }
                    const workspace = workspaces.find((w) => w.id === id)
                    if (!workspace) return null
                    const Icon = workspaceTypes[workspace.type].icon
                    return (
                      <SelectItem key={id} value={id}>
                        <Icon className="text-muted-foreground" />
                        {workspace.title}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="live-date">Date</Label>
              <Input id="live-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="live-time">Start</Label>
              <Input id="live-time" type="time" value={form.time} onChange={(e) => set('time', e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="live-duration">Length</Label>
              <Select value={String(form.duration)} onValueChange={(value) => set('duration', Number(value))}>
                <SelectTrigger id="live-duration" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durations.map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {formatDuration(minutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="live-description">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="live-description"
              value={form.description}
              maxLength={5000}
              rows={3}
              placeholder="What to prepare, links, agenda…"
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={form.calendar}
              onChange={(e) => set('calendar', e.target.checked)}
              className="mt-0.5 size-4 accent-brand"
            />
            <span className="space-y-0.5">
              <span className="block font-medium">
                {editing && session.calendar_event_id ? 'Update the Google Calendar invite' : 'Add to Google Calendar'}
              </span>
              <span className="block text-xs text-muted-foreground">
                Creates the event in your calendar and emails an invite to everyone{' '}
                {editing
                  ? 'the session is for'
                  : workspaceId || form.scope !== GROUP_WIDE
                    ? 'in the workspace'
                    : 'in the group'}
                . Google may ask you to allow calendar access.
              </span>
            </span>
          </label>

          {save.isError && (
            <p role="alert" className="text-sm text-destructive">
              {save.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!form.title.trim() || !start || save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              {editing ? 'Save changes' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
