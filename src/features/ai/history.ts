// Calsko AI's conversation, kept in this browser for good (owner's choice, 2026-10-26): per person
// and per group, so reopening the panel, reloading or coming back tomorrow shows it again. "New chat"
// clears it. Nothing goes to the server; another person signing in on the same browser has their own.
// Read back as untrusted (it's storage anyone with the browser can edit), so bad entries are dropped.

/** The newest turns kept; older ones fall off. */
const KEEP = 50

const key = (userId: string, teamId: string) => `devdock:ask:${userId}:${teamId}`

export type StoredTurn = Record<string, unknown> & { kind: string }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** A turn as the panel draws it: text turns need text; an action card needs its id, expiry and preview. */
function valid(turn: unknown): turn is StoredTurn {
  if (!isObject(turn) || typeof turn.id !== 'number') return false
  if (turn.kind === 'user' || turn.kind === 'assistant' || turn.kind === 'error') return typeof turn.text === 'string'
  if (turn.kind !== 'action' || !isObject(turn.action) || typeof turn.state !== 'string') return false
  const { action } = turn
  return (
    typeof action.pendingActionId === 'string' &&
    typeof action.expiresAt === 'string' &&
    isObject(action.preview) &&
    typeof action.preview.title === 'string' &&
    Array.isArray(action.editable)
  )
}

export function loadHistory(userId: string, teamId: string): StoredTurn[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key(userId, teamId)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(valid).slice(-KEEP) : []
  } catch {
    return []
  }
}

export function saveHistory(userId: string, teamId: string, turns: readonly StoredTurn[]) {
  try {
    if (turns.length === 0) localStorage.removeItem(key(userId, teamId))
    else localStorage.setItem(key(userId, teamId), JSON.stringify(turns.slice(-KEEP)))
  } catch {
    // Blocked or full storage: the chat still works for this visit.
  }
}
