import { queryOptions } from '@tanstack/react-query'
import { toDataError } from '@/lib/errors'
import { SETTLED_STALE_MS } from '@/lib/query-client'
import { supabase } from '@/lib/supabase'
import { logError } from '@/lib/error-tracking'

/** Which emails you get. No row yet means all of them. */
export type EmailSettings = { reminders: boolean; meetings: boolean; chat: boolean }

export const emailSettingsKey = (userId: string) => ['email-settings', userId] as const

/** Read only when the Email menu opens; nothing else needs it. */
export const emailSettingsQuery = (userId: string) =>
  queryOptions({
    queryKey: emailSettingsKey(userId),
    queryFn: async (): Promise<EmailSettings> => {
      const { data, error } = await supabase
        .from('email_settings')
        .select('reminders, meetings, chat')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw toDataError('load your email settings', error)
      return data ?? { reminders: true, meetings: true, chat: true }
    },
    staleTime: SETTLED_STALE_MS,
  })

export async function saveEmailSettings(change: Partial<EmailSettings>) {
  const { error } = await supabase.rpc('save_email_settings', {
    p_reminders: change.reminders,
    p_meetings: change.meetings,
    p_chat: change.chat,
  })
  if (error) throw toDataError('save your email settings', error)
}

/**
 * Keeps the browser's time zone, so meeting and note emails show times in it. Called once per sign-in,
 * never awaited: a failure only means times in the organizer's zone.
 */
export function saveMyTimeZone() {
  let zone: string | undefined
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return
  }
  if (!zone) return
  void supabase.rpc('save_email_settings', { p_time_zone: zone }).then(({ error }) => {
    if (error) logError('[email] saving the time zone failed', error)
  })
}
