import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
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
