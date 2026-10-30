// Opens the "New …" dialog from a lazy page without importing it there: importing the dialog into a lazy
// chunk made the bundler regroup shared code and cost the first load ~4 KB. AppLayout mounts one dialog
// that listens (`CreateWorkspaceDialog listen`).
import type { WorkspaceModule, WorkspaceType } from './api'

const EVENT = 'devdock:new-workspace'

export type NewWorkspaceRequest = {
  /** Hides the type choice. */
  fixedType?: WorkspaceType
  /** A tool that stays on. */
  requiredModule?: WorkspaceModule
  /** Where to go after creating, given the new id; default its overview. */
  createdPath?: (workspaceId: string) => string
}

export function openNewWorkspace(request: NewWorkspaceRequest = {}) {
  window.dispatchEvent(new CustomEvent<NewWorkspaceRequest>(EVENT, { detail: request }))
}

export function onOpenNewWorkspace(listener: (request: NewWorkspaceRequest) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<NewWorkspaceRequest>).detail ?? {})
  window.addEventListener(EVENT, handle)
  return () => window.removeEventListener(EVENT, handle)
}
