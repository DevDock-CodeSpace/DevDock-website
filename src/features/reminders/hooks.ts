import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/hooks'
import { markNotificationRead, notificationsQuery } from '@/features/messaging/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import { errorMessage } from '@/lib/errors'
import { ownSave, ownWrite } from '@/lib/realtime'
import {
  createReminder,
  reminderKeys,
  setReminderStatus,
  updateReminder,
  type CreateReminderInput,
  type Reminder,
  type ReminderInput,
  type RemindersPage,
  type ReminderStatus,
} from './api'

// Writes say they're our own (lib/realtime), so this tab's echo doesn't refetch a second time,
// then refetch the lists themselves: a reminder can move between sections, and counts change.

/** Runs a save of one row with its echo dropped (ownSave), then refetches the lists. */
function useReminderWrite<TVars extends { id: string }>(write: (vars: TVars) => Promise<Reminder>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: TVars) => {
      const saved = ownSave('reminders', vars.id)
      try {
        const reminder = await write(vars)
        saved(reminder.updated_at)
        return reminder
      } catch (error) {
        saved()
        throw error
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: reminderKeys.lists }),
  })
}

export function useCreateReminder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateReminderInput) => createReminder(input),
    onSuccess: (reminder) => {
      ownWrite('reminders', reminder.id)
      return queryClient.invalidateQueries({ queryKey: reminderKeys.lists })
    },
  })
}

export function useUpdateReminder() {
  return useReminderWrite(({ id, patch }: { id: string; patch: Partial<ReminderInput> }) => updateReminder(id, patch))
}

/**
 * Complete, cancel or reopen. Optimistic: the row's status changes in every cached section at
 * once, and each section only shows rows with its own status, so it moves out immediately.
 * Returns a promise rather than taking callbacks: the row that started it unmounts as it moves,
 * and TanStack skips a mutate() call's callbacks once their component is gone.
 */
export function useSetReminderStatus() {
  const queryClient = useQueryClient()
  const write = useReminderWrite(({ id, status }: { id: string; status: ReminderStatus }) => setReminderStatus(id, status))
  const { mutateAsync } = write
  return (id: string, status: ReminderStatus): Promise<Reminder> => {
    void queryClient.cancelQueries({ queryKey: reminderKeys.lists })
    queryClient.setQueriesData<InfiniteData<RemindersPage>>({ queryKey: reminderKeys.lists }, (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          rows: page.rows.map((row) => (row.id === id ? { ...row, status } : row)),
        })),
      },
    )
    return mutateAsync({ id, status })
  }
}

const showError = (error: unknown) => void toast.error(errorMessage(error))

/** Done, archive or reopen a note, with a toast (and Undo when it left the open notes). */
export function useChangeNoteStatus() {
  const setStatus = useSetReminderStatus()
  return (reminder: Reminder, status: ReminderStatus, done: string) =>
    setStatus(reminder.id, status).then(
      () =>
        void toast.success(done, {
          action: status === 'pending' ? undefined : { label: 'Undo', onClick: () => void setStatus(reminder.id, 'pending').catch(showError) },
        }),
      showError,
    )
}

/**
 * Moves a due note to a later time (which re-arms it) and clears its notification from the bell.
 * The notification ids come from the bell's cached list, so this costs no extra read.
 */
export function useSnoozeNote() {
  const queryClient = useQueryClient()
  const { team } = useCurrentTeam()
  const { user } = useAuth()
  const update = useUpdateReminder()
  return (reminder: Reminder, until: Date, label: string) =>
    update
      .mutateAsync({ id: reminder.id, patch: { remindAt: until.toISOString() } })
      .then(async () => {
        const bell = notificationsQuery(team.id, user.id)
        const unread = (queryClient.getQueryData(bell.queryKey) ?? []).filter((n) => n.reminder_id === reminder.id && !n.read_at)
        await Promise.all(unread.map((n) => markNotificationRead(n.id)))
        if (unread.length) void queryClient.invalidateQueries({ queryKey: bell.queryKey })
        toast.success(`Snoozed until ${label}.`)
      })
      .catch(showError)
}
