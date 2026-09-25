import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

// Paper-style collapsible sections: a ▾ toggle on every top-level heading
// hides everything below it up to the next heading of the same or higher level.
// Collapsed state is per viewer (plugin state, not saved in the doc), so it
// works in read-only docs too. Positions are mapped through edits.

type ToggleMeta = { toggle: number }

export const collapsibleHeadingsKey = new PluginKey<number[]>('collapsibleHeadings')

const chevron =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 8h12l-6 8z"/></svg>'

function toggleButton(pos: number, collapsed: boolean) {
  return (view: EditorView) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.contentEditable = 'false'
    button.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section')
    button.setAttribute('aria-expanded', String(!collapsed))
    // Sits in the gutter left of the heading; visible on hover, always when collapsed.
    button.className = [
      'absolute top-1/2 -left-6 flex size-5 -translate-y-1/2 items-center justify-center rounded-sm',
      'text-muted-foreground transition hover:bg-muted hover:text-foreground',
      collapsed ? 'opacity-100 [&_svg]:-rotate-90' : 'opacity-0 group-hover/heading:opacity-100 focus-visible:opacity-100',
    ].join(' ')
    button.innerHTML = chevron
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch(view.state.tr.setMeta(collapsibleHeadingsKey, { toggle: pos } satisfies ToggleMeta))
    })
    return button
  }
}

export const CollapsibleHeadings = Extension.create({
  name: 'collapsibleHeadings',

  addProseMirrorPlugins() {
    return [
      new Plugin<number[]>({
        key: collapsibleHeadingsKey,
        state: {
          init: () => [],
          apply(tr, collapsed, _oldState, newState) {
            let next = tr.docChanged ? collapsed.map((pos) => tr.mapping.map(pos)) : collapsed
            const meta = tr.getMeta(collapsibleHeadingsKey) as ToggleMeta | undefined
            if (meta) {
              next = next.includes(meta.toggle) ? next.filter((p) => p !== meta.toggle) : [...next, meta.toggle]
            }
            // Drop positions that no longer start a heading (it was deleted or changed).
            return next.filter((pos) => newState.doc.nodeAt(pos)?.type.name === 'heading')
          },
        },
        props: {
          decorations(state) {
            const collapsed = collapsibleHeadingsKey.getState(state) ?? []
            const decorations: Decoration[] = []
            let hiddenBelowLevel: number | null = null

            state.doc.forEach((node, pos) => {
              const range = [pos, pos + node.nodeSize] as const
              const isHeading = node.type.name === 'heading'
              const level = isHeading ? (node.attrs.level as number) : Infinity
              if (hiddenBelowLevel !== null && level <= hiddenBelowLevel) hiddenBelowLevel = null

              if (hiddenBelowLevel !== null) {
                decorations.push(Decoration.node(...range, { class: 'hidden' }))
                return
              }
              if (!isHeading) return

              const isCollapsed = collapsed.includes(pos)
              decorations.push(
                Decoration.node(...range, {
                  class: 'group/heading',
                  ...(isCollapsed ? { 'data-collapsed': 'true' } : {}),
                }),
                Decoration.widget(pos + 1, toggleButton(pos, isCollapsed), {
                  side: -1,
                  ignoreSelection: true,
                  // Clicks on the toggle are ours; ProseMirror shouldn't treat them as selection.
                  stopEvent: () => true,
                  key: `heading-toggle-${pos}-${isCollapsed}`,
                }),
              )
              if (isCollapsed) hiddenBelowLevel = level
            })

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
