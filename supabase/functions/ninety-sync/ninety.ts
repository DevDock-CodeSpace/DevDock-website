// The Ninety public API (https://api.public.ninety.io/v1), only the calls the sync needs.
// A personal access token acts as the person who made it.

export const NINETY_API = 'https://api.public.ninety.io/v1'
const TIMEOUT_MS = 15_000

export class NinetyError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Ninety ${status}: ${detail}`)
  }
}

export type NinetyTeam = { _id: string; name: string; companyId?: string; deleted?: boolean }
export type NinetyUser = { id: string; primaryEmail?: string; firstName?: string; lastName?: string; role?: string; active?: boolean }
export type NinetyTodo = { _id: string }
export type NinetyRock = { _id: string }
export type NinetyMilestone = { _id: string }
export type NinetyIssue = { _id: string }
export type NinetyRecord = Record<string, unknown> & { _id?: string; id?: string }

/** Already gone in Ninety is what a delete wanted. */
async function ignoreMissing(request: Promise<unknown>) {
  try {
    await request
  } catch (e) {
    if (!(e instanceof NinetyError && e.status === 404)) throw e
  }
}

export function ninetyClient(token: string, fetcher: typeof fetch = fetch) {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetcher(`${NINETY_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok) throw new NinetyError(res.status, text.slice(0, 300))
    return (text ? JSON.parse(text) : null) as T
  }
  const list = <T>(body: T[] | { items?: T[] } | null): T[] => (Array.isArray(body) ? body : (body?.items ?? []))

  return {
    // Reads for the Ninety page (overview). Lists come as a list or as { items }.
    openTodos: async (teamId: string) => list(await call<NinetyRecord[]>('POST', '/todos/query/paged', { teamId, completed: false, pageSize: 100 })),
    doneTodos: async (teamId: string) => list(await call<NinetyRecord[]>('POST', '/todos/query/paged', { teamId, completed: true, pageSize: 25 })),
    rocks: async (teamId: string) => list(await call<NinetyRecord[]>('POST', '/rocks/query/paged', { teamId, archived: false, pageSize: 100 })),
    rockMilestones: async (rockId: string) => list(await call<NinetyRecord[]>('GET', `/rocks/${encodeURIComponent(rockId)}/milestones`)),
    issues: async (teamId: string) => list(await call<NinetyRecord[]>('POST', '/issues/query', { teamId, pageSize: 100 })),
    headlines: async (teamId: string) => list(await call<NinetyRecord[]>('GET', `/headlines?teamId=${encodeURIComponent(teamId)}`)),
    scorecard: (teamId: string) => call<NinetyRecord>('GET', `/scorecard/team-scorecard?teamId=${encodeURIComponent(teamId)}`),
    // Only the teams the token's owner can create work in (GET /teams lists every team in the company), so a
    // project is never linked to a team where sending would be refused.
    teams: async () => list(await call<NinetyTeam[]>('GET', '/teams/available')).filter((t) => !t.deleted),
    users: async () => list(await call<NinetyUser[]>('GET', '/users')),
    createTodo: (body: unknown) => call<NinetyTodo>('POST', '/todos', body),
    updateTodo: (id: string, body: unknown) => call<NinetyTodo>('PATCH', `/todos/${encodeURIComponent(id)}`, body),
    deleteTodo: (id: string) => ignoreMissing(call<null>('DELETE', `/todos/${encodeURIComponent(id)}`)),
    /** POST /rocks wraps the Rock (`{ rock }`) and answers with a list. */
    createRock: async (rock: unknown) => {
      const body = await call<NinetyRock[] | NinetyRock>('POST', '/rocks', { rock })
      const created = Array.isArray(body) ? body[0] : body
      if (!created?._id) throw new NinetyError(502, 'no rock id in the answer')
      return created
    },
    updateRock: (id: string, body: unknown) => call<NinetyRock>('PATCH', `/rocks/${encodeURIComponent(id)}`, body),
    deleteRock: (id: string) => ignoreMissing(call<null>('DELETE', `/rocks/${encodeURIComponent(id)}`)),
    createMilestone: (body: { rockId: string; teamId: string; title: string; dueDate: string }) => call<NinetyMilestone>('POST', '/milestones', body),
    updateMilestone: (id: string, body: unknown) => call<NinetyMilestone>('PATCH', `/milestones/${encodeURIComponent(id)}`, body),
    createIssue: (body: unknown) => call<NinetyIssue | NinetyIssue[]>('POST', '/issues', body).then((b) => {
      const created = Array.isArray(b) ? b[0] : b
      if (!created?._id) throw new NinetyError(502, 'no issue id in the answer')
      return created
    }),
    updateIssue: (id: string, body: unknown) => call<NinetyIssue>('PATCH', `/issues/${encodeURIComponent(id)}`, body),
    deleteIssue: (id: string) => ignoreMissing(call<null>('DELETE', `/issues/${encodeURIComponent(id)}`)),
    linkTodoToRock: (todoId: string, rockId: string) =>
      call<unknown>('POST', `/todos/${encodeURIComponent(todoId)}/links`, { linkedItemId: rockId, linkedItemType: 'rock' }),
    unlinkTodoFromRock: (todoId: string, rockId: string) =>
      ignoreMissing(call<null>('DELETE', `/todos/${encodeURIComponent(todoId)}/links/${encodeURIComponent(rockId)}`)),
  }
}

export type NinetyClient = ReturnType<typeof ninetyClient>

/** "Vishwajeet Mannepalli", else the email. */
export function userName(user: NinetyUser): string {
  const name = [user.firstName, user.lastName].map((p) => p?.trim()).filter(Boolean).join(' ')
  return name || user.primaryEmail || 'Ninety user'
}
