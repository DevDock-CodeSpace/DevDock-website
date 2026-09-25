import { Globe } from 'lucide-react'
import { workspaceTypes } from '@/features/teams/permissions'
import type { DocSummary } from '../api'

/** "Team-wide" or the workspace (type icon + title) a doc is assigned to. */
export function DocScope({ doc }: { doc: Pick<DocSummary, 'workspace'> }) {
  if (!doc.workspace) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe className="size-3.5 shrink-0" />
        Team-wide
      </span>
    )
  }
  const Icon = workspaceTypes[doc.workspace.type].icon
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{doc.workspace.title}</span>
    </span>
  )
}
