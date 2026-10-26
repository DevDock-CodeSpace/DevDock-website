// The conversation you last had open in each group, per browser (localStorage). Chat opens it
// again; with none (a new account, a new browser) it opens nothing and explains how to start.
// Costs no request; losing it only means Chat opens on the instructions.

const key = (teamId: string) => `devdock:chat-last:${teamId}`

export function readLastConversation(teamId: string): string | null {
  try {
    return localStorage.getItem(key(teamId))
  } catch {
    return null
  }
}

export function rememberConversation(teamId: string, conversationId: string) {
  try {
    localStorage.setItem(key(teamId), conversationId)
  } catch {
    // Storage blocked: Chat just opens on the instructions next time.
  }
}
