import type { CSSProperties } from 'react'
import { BlockNode } from './BlockNode'
import { ConnectorEdge } from './ConnectorEdge'
import { ContainerNode } from './ContainerNode'
import { IconNode } from './IconNode'
import { ShapeNode } from './ShapeNode'

// What every React Flow canvas of a diagram renders with: the editor and the
// Mermaid import preview, so the preview looks exactly like the result.

export const nodeTypes = { shape: ShapeNode, icon: IconNode, container: ContainerNode, block: BlockNode }
export const edgeTypes = { connector: ConnectorEdge }

// React Flow's own colors, pointed at DevDock's theme tokens.
export const flowStyle = {
  '--xy-background-color': 'var(--background)',
  '--xy-selection-background-color': 'color-mix(in oklab, var(--brand) 8%, transparent)',
  '--xy-selection-border': '1px solid var(--brand)',
  '--xy-connectionline-stroke': 'var(--brand)',
  '--xy-connectionline-stroke-width': '1.5',
} as CSSProperties
