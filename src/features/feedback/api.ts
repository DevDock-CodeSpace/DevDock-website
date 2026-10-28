import { toDataError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

/**
 * Feedback from the header's button: a problem, an idea or anything else, read by the platform admin in
 * /admin → Feedback. send_feedback stamps who sent it and keeps the group only if they're in it.
 */
export type FeedbackKind = 'problem' | 'idea' | 'other'

export const FEEDBACK_KINDS: { value: FeedbackKind; label: string; placeholder: string }[] = [
  { value: 'problem', label: 'Something’s wrong', placeholder: 'What happened, and what did you expect? Where was it?' },
  { value: 'idea', label: 'An idea', placeholder: 'What would make DevDock better for you?' },
  { value: 'other', label: 'Something else', placeholder: 'Tell us anything.' },
]

export const FEEDBACK_MAX = 5000

export async function sendFeedback(kind: FeedbackKind, message: string, teamId: string | null) {
  // Where they were and on what, to help reproduce a problem. Nothing else about the page is sent.
  const context = {
    browser: navigator.userAgent.slice(0, 300),
    screen: `${window.innerWidth}×${window.innerHeight}`,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  }
  const { error } = await supabase.rpc('send_feedback', {
    p_kind: kind,
    p_message: message,
    p_page: (window.location.pathname + window.location.search).slice(0, 500),
    // null: sent from outside a group (the generated type says string).
    p_team: teamId as string,
    p_context: context,
  })
  if (error) throw toDataError('send your feedback', error, { P0001: 'That’s a lot of feedback for one day. Please try again tomorrow.' })
}
