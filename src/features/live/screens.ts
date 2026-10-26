import type { ComponentProps } from 'react'
import { preloadable } from '@/lib/preloadable'

type CalendarProps = ComponentProps<(typeof import('./components/MeetingCalendar'))['MeetingCalendar']>

/** The meetings calendar (the default view): its code loads with the Meetings page (route loader). */
export const meetingCalendar = preloadable<CalendarProps>(() => import('./components/MeetingCalendar').then((m) => ({ default: m.MeetingCalendar })))
