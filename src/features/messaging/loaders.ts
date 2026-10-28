import type { LoaderFunctionArgs } from 'react-router'
import { requireUser } from '@/features/auth/loaders'
import { myTeamsQuery, teamMembersQuery } from '@/features/teams/api'
import { queryClient } from '@/lib/query-client'
import { teamConversationMembersQuery, teamConversationsQuery } from './api'
import { conversationView } from './screens'

/**
 * /t/:teamSlug/messages (Chat, where the app opens): the conversation list, the group's people and who is
 * in which conversation start together with the group, and the open conversation's code downloads beside
 * them. They used to start one after another as the page rendered (three rounds before the list showed).
 */
export async function messagesLoader({ request, params }: LoaderFunctionArgs) {
  const user = await requireUser(request)
  void conversationView.preload()
  const memberships = await queryClient.ensureQueryData(myTeamsQuery(user.id))
  const team = memberships.find((m) => m.team.slug === params.teamSlug)?.team
  if (!team) return null
  void queryClient.prefetchQuery(teamConversationsQuery(team.id))
  void queryClient.prefetchQuery(teamMembersQuery(team.id))
  void queryClient.prefetchQuery(teamConversationMembersQuery(team.id))
  return null
}
