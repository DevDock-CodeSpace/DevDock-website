import { ConnectionMode, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { LoaderCircle } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { DiagramEditorContext } from './context'
import { edgeTypes, flowStyle, nodeTypes } from './flowTypes'
import { findMermaid } from './mermaid/detect'
import type { ImportResult, SavedDiagram } from './mermaid/layout'
import { importSummary, skippedSummary } from './mermaid/summary'
import { parse, type DiagramEdge, type DiagramNode } from './model'

export type ImportedDiagram = Extract<ImportResult, { ok: true }>
type Importer = typeof import('./mermaid/layout')

const EXAMPLE = `flowchart LR
  A[Sign up] --> B{Email valid?}
  B -->|Yes| C[(Save user)]
  B -->|No| D[Show error]`

/**
 * "Import Mermaid": paste a flowchart or ER diagram, see what it becomes, and add it.
 * The importer (and dagre) loads when the dialog opens; the preview is the real layout,
 * drawn by the editor's own node and connector components.
 */
export function MermaidImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (result: ImportedDiagram) => void
}) {
  const [text, setText] = useState('')
  const [importer, setImporter] = useState<Importer | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    if (!open || importer) return
    let live = true
    import('./mermaid/layout').then(
      (mod) => live && setImporter(mod),
      () => live && setLoadFailed(true),
    )
    return () => {
      live = false
    }
  }, [open, importer])

  // Parsing and layout take a few milliseconds; deferring keeps typing smooth on big diagrams.
  const deferred = useDeferredValue(text)
  const result = useMemo((): ImportResult | null => {
    if (!importer || !deferred.trim()) return null
    const found = findMermaid(deferred)
    if (!found) {
      return {
        ok: false,
        error: 'This doesn’t look like Mermaid code. It starts with a line such as “flowchart TD” or “erDiagram”.',
        skipped: [],
      }
    }
    return importer.mermaidToDiagram(found.code)
  }, [importer, deferred])
  const ready = result?.ok && deferred === text ? result : null

  const close = (next: boolean) => {
    if (!next) setText('')
    onOpenChange(next)
  }
  const add = () => {
    if (!ready) return
    onImport(ready)
    close(false)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      add()
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import Mermaid</DialogTitle>
          <DialogDescription>
            Paste a Mermaid flowchart or ER diagram, from ChatGPT, Claude, GitHub or a Markdown file. It’s added as
            ordinary shapes you can move and edit. You can also paste Mermaid straight onto the canvas.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={EXAMPLE}
            aria-label="Mermaid code"
            spellCheck={false}
            autoFocus
            className="h-96 resize-none font-mono text-xs leading-relaxed"
          />
          <div className="flex h-96 min-w-0 flex-col overflow-hidden rounded-md border bg-background">
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              {loadFailed ? (
                <p className="p-3 text-center text-sm text-muted-foreground">The importer couldn’t load. Check your connection and try again.</p>
              ) : !importer ? (
                <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
              ) : result?.ok ? (
                <div className="absolute inset-0">
                  {/* Every layout has new ids: keyed on one, each new result is fitted to the view again. */}
                  <Preview key={result.diagram.nodes[0]?.id} diagram={result.diagram} />
                </div>
              ) : (
                <p className="p-3 text-center text-sm text-muted-foreground">
                  {result ? result.error : 'A preview of the diagram appears here.'}
                </p>
              )}
            </div>
            {result?.ok && (
              <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                <p>
                  <span className="text-foreground">{result.kind === 'er' ? 'ER diagram' : 'Flowchart'}</span>
                  {' · '}
                  {importSummary(result.kind, result.counts)}
                </p>
                {result.skipped.length > 0 && <p className="mt-1 text-amber-700 dark:text-amber-400">{skippedSummary(result.skipped)}</p>}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button disabled={!ready} onClick={add}>
            Add to diagram
            <span className="ml-1 font-mono text-xs opacity-60">⌘↵</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const noop = () => {}
/** The node components ask the editor for these; the preview is read-only, so nothing happens. */
const previewContext = {
  readOnly: true,
  editingId: null,
  setEditingId: noop,
  snapshot: noop,
  updateNode: noop,
  updateEdge: noop,
  resized: noop,
}

/** The imported diagram on a read-only canvas, drawn by the same components as the editor. */
function Preview({ diagram }: { diagram: SavedDiagram }) {
  const content = useMemo(() => parse(diagram), [diagram])
  return (
    <DiagramEditorContext.Provider value={previewContext}>
      <ReactFlowProvider>
        <ReactFlow<DiagramNode, DiagramEdge>
          nodes={content.nodes}
          edges={content.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          zIndexMode="manual"
          // Every handle is a source; Loose lets connectors end on one too (as in the editor).
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
          minZoom={0.05}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesReconnectable={false}
          zoomOnDoubleClick={false}
          deleteKeyCode={null}
          disableKeyboardA11y
          proOptions={{ hideAttribution: true }}
          style={flowStyle}
          className="[&_.react-flow__node]:cursor-default"
          aria-label="Preview of the imported diagram"
        />
      </ReactFlowProvider>
    </DiagramEditorContext.Provider>
  )
}
