import { useParams } from 'react-router'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import { hasWorkspaceTab, workspaceTabDefs } from '@/features/teams/nav'

/** Tabs whose features don't exist yet (Docs, Live, …). Unknown tabs for this type → not found. */
export function WorkspaceTabPage() {
  const { tab = '' } = useParams()
  const { workspace } = useCurrentWorkspace()

  if (!hasWorkspaceTab(workspace.type, tab) || !workspaceTabDefs[tab].soon) {
    return (
      <div className="py-16 text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <p className="mt-1 font-medium">This page doesn’t exist in this workspace.</p>
      </div>
    )
  }

  const { title, icon: Icon, soon } = workspaceTabDefs[tab]
  return (
    <div className="flex max-w-lg items-start gap-4 py-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="space-y-1">
        <p className="font-medium">
          {title} <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">coming soon</span>
        </p>
        <p className="text-sm text-muted-foreground">{soon}</p>
      </div>
    </div>
  )
}
