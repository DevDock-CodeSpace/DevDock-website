import { mergeAttributes, Node } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { FileLinkView } from './FileLinkView'

export type FileLinkKind = 'doc' | 'diagram'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileLink: {
      /** Replace `from`–`to` (the typed `[[query`) with a link to a doc or diagram, then a space. */
      insertFileLink: (attrs: { kind: FileLinkKind; id: string }, range?: { from: number; to: number }) => ReturnType
    }
  }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** A DevDock doc or diagram URL (group or workspace view): …/t/<group>/(w/<id>/)?(docs|diagrams)/<id>. */
const FILE_URL = new RegExp(`^/t/[a-z0-9-]+/(?:w/${UUID}/)?(docs|diagrams)/(${UUID})/?$`)

/** The doc or diagram a pasted URL points at, when it's this site's and nothing else was pasted. */
export function fileFromUrl(text: string, origin: string): { kind: FileLinkKind; id: string } | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.origin !== origin) return null
  const match = FILE_URL.exec(url.pathname)
  if (!match) return null
  return { kind: match[1] === 'docs' ? 'doc' : 'diagram', id: match[2] }
}

/**
 * An inline link to a doc or diagram (Files). It stores only the kind and the id, never a title:
 * the view shows the current title from the group's lists (one cached query per kind, whatever the
 * number of links), and someone who can't open the item sees that, not its name. Typed with `[[`
 * (FileLinkPicker), added from the + menu, or made by pasting a DevDock doc/diagram URL.
 */
export const FileLink = Node.create({
  name: 'fileLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: 'doc' satisfies FileLinkKind },
      id: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-file-link]',
        getAttrs: (element) => {
          const kind = element.getAttribute('data-kind')
          const id = element.getAttribute('data-id')
          return (kind === 'doc' || kind === 'diagram') && id && new RegExp(`^${UUID}$`).test(id) ? { kind, id } : false
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-file-link': '', 'data-kind': node.attrs.kind, 'data-id': node.attrs.id }),
      node.attrs.kind === 'diagram' ? '[diagram]' : '[doc]',
    ]
  },

  // The plain-text copy (documents.content) never carries a linked item's title.
  renderText({ node }) {
    return node.attrs.kind === 'diagram' ? '[diagram]' : '[doc]'
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileLinkView, { as: 'span' })
  },

  addCommands() {
    return {
      insertFileLink:
        (attrs, range) =>
        ({ chain, state }) => {
          const { from, to } = range ?? state.selection
          return chain()
            .insertContentAt({ from, to }, [{ type: this.name, attrs }, { type: 'text', text: ' ' }])
            .run()
        },
    }
  },

  addProseMirrorPlugins() {
    const type = this.type
    return [
      new Plugin({
        key: new PluginKey('fileLink'),
        props: {
          // Pasting a DevDock doc or diagram URL makes a link to it.
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData('text/plain') ?? ''
            const file = fileFromUrl(text, window.location.origin)
            // Inside a code block a URL stays text.
            if (!file || !view.editable || view.state.selection.$from.parent.type.spec.code) return false
            const { from, to } = view.state.selection
            view.dispatch(view.state.tr.replaceWith(from, to, [type.create(file), view.state.schema.text(' ')]).scrollIntoView())
            return true
          },
        },
      }),
    ]
  },
})
