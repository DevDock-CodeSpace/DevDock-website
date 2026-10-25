import { Outlet } from 'react-router'
import { useCurrentWorkspace } from '@/features/teams/hooks'
import type { WorkspaceModule } from '@/features/workspaces/api'
import { ToolNotEnabled } from '@/features/workspaces/components/ToolNotEnabled'

/**
 * Parent route for a built workspace tool: renders its pages only if the tool is enabled here.
 * With several tools (Files: docs or diagrams), any one of them is enough.
 */
export function WorkspaceToolGate({ tool }: { tool: WorkspaceModule | WorkspaceModule[] }) {
  const { workspace } = useCurrentWorkspace()
  const tools = Array.isArray(tool) ? tool : [tool]
  return tools.some((t) => workspace.modules.includes(t)) ? <Outlet /> : <ToolNotEnabled />
}
