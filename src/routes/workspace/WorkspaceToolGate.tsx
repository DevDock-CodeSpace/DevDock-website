import { Outlet } from 'react-router'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import type { WorkspaceModule } from '@/features/workspaces/api'
import { ToolNotEnabled } from '@/features/workspaces/components/ToolNotEnabled'

/** Parent route for a built workspace tool: renders its pages only if the tool is enabled here. */
export function WorkspaceToolGate({ tool }: { tool: WorkspaceModule }) {
  const { workspace } = useCurrentWorkspace()
  return workspace.modules.includes(tool) ? <Outlet /> : <ToolNotEnabled />
}
