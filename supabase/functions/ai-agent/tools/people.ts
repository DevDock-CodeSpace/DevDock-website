// People: find someone in the group by name.

import type { AiExecutionContext, AiToolResult } from '../agent/types.ts'
import { defineTool } from './registry.ts'
import { bestMatches, dbFailure, fold, ok } from './shared.ts'

export type Person = { id: string; name: string }

/** Everyone in the group, as the Members page reads them (RLS: group members only). Names only. */
export async function loadPeople(context: AiExecutionContext): Promise<AiToolResult<Person[]>> {
  const { data, error } = await context.db
    .from('team_members')
    .select('user_id, profile:profiles(display_name)')
    .eq('team_id', context.teamId)
    .limit(500)
  if (error) return dbFailure('load the group’s people', error)
  const rows = data as unknown as { user_id: string; profile: { display_name: string | null } | null }[]
  return ok(rows.map((row) => ({ id: row.user_id, name: row.profile?.display_name?.trim() || 'Unnamed member' })))
}

const ME = new Set(['me', 'myself', 'i'])

export const peopleTools = [
  defineTool<{ name: string }>({
    name: 'find_user',
    description:
      'Find people in the current group by name (a first name or part of a name is enough). Returns their id and full name. ' +
      'Call this before any tool that needs a person’s id. If it returns several people, ask the user which one they mean; never pick.',
    domain: 'people',
    capability: 'search',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The name to look for, e.g. "Sree".', minLength: 1, maxLength: 80 } },
      required: ['name'],
    },
    async execute({ name }, context) {
      const people = await loadPeople(context)
      if (!people.success) return people
      const matches = ME.has(fold(name)) ? people.data.filter((p) => p.id === context.userId) : bestMatches(people.data, name, (p) => p.name)
      return ok({
        people: matches.slice(0, 8).map((p) => ({ id: p.id, name: p.name, isYou: p.id === context.userId })),
        ...(matches.length > 8 ? { more: matches.length - 8 } : {}),
      })
    },
  }),
]
