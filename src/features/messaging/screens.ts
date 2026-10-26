import type { ComponentProps } from 'react'
import { preloadable } from '@/lib/preloadable'

type ConversationProps = ComponentProps<(typeof import('./components/ConversationView'))['ConversationView']>

/** The open conversation (TipTap composer): starts downloading with the Chat page (route loader). */
export const conversationView = preloadable<ConversationProps>(() => import('./components/ConversationView').then((m) => ({ default: m.ConversationView })))
