import { createContext, useContext } from 'react'
import type { ConnectorData, DiagramNodeData } from './model'

type DiagramEditorContextValue = {
  readOnly: boolean
  /** Node or edge whose text is being edited in place. */
  editingId: string | null
  setEditingId: (id: string | null) => void
  /** Record an undo step before a change. */
  snapshot: () => void
  /** Change node/edge data as one undoable step. */
  updateNode: (id: string, patch: Partial<DiagramNodeData>) => void
  updateEdge: (id: string, patch: Partial<ConnectorData>) => void
}

export const DiagramEditorContext = createContext<DiagramEditorContextValue | null>(null)

export function useDiagramEditor() {
  const context = useContext(DiagramEditorContext)
  if (!context) throw new Error('useDiagramEditor must be used inside the diagram editor.')
  return context
}
