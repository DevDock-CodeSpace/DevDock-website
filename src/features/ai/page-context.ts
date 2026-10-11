import type { AiPageContext } from './api'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What the person has open, read from the URL alone: the workspace, and the
 * issue, meeting or conversation on screen. Identifiers only, never page data;
 * the function looks them up again as the caller and drops what they can't see.
 */
export function pageContext(pathname: string, search: string): AiPageContext {
  const [, , , section, ...rest] = pathname.split('/')
  // /t/:teamSlug/<section>/…
  if (section === 'w') {
    const [workspaceId, tab, item] = rest
    if (!UUID.test(workspaceId ?? '')) return {}
    if (tab === 'issues' && /^\d+$/.test(item ?? '')) {
      return { workspaceId, currentEntity: { type: 'issue', workspaceId, number: Number(item) } }
    }
    if (tab === 'live' && UUID.test(item ?? '')) return { workspaceId, currentEntity: { type: 'meeting', id: item } }
    return { workspaceId }
  }
  if (section === 'live' && UUID.test(rest[0] ?? '')) return { currentEntity: { type: 'meeting', id: rest[0] } }
  if (section === 'messages') {
    const conversation = new URLSearchParams(search).get('c')
    if (conversation && UUID.test(conversation)) return { currentEntity: { type: 'conversation', id: conversation } }
  }
  return {}
}
