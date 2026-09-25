import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { DocImageView } from './DocImageView'

export type ImageWidth = 'small' | 'medium' | 'full'
export type ImageAlign = 'left' | 'center'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    docImage: {
      /** Insert an uploaded image (by storage path) at `pos`, or at the selection. */
      insertDocImage: (attrs: { path: string; alt?: string }, pos?: number) => ReturnType
    }
  }
}

/**
 * An image stored in the private `doc-images` bucket. The doc keeps the storage
 * *path*, never a URL: the view asks for a short-lived signed URL, so access is
 * always re-checked by Storage RLS.
 */
export const DocImage = Node.create({
  name: 'docImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      path: { default: null },
      alt: { default: '' },
      width: { default: 'full' satisfies ImageWidth },
      align: { default: 'center' satisfies ImageAlign },
    }
  },

  parseHTML() {
    return [{ tag: 'img[data-doc-image]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes({ 'data-doc-image': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocImageView)
  },

  addCommands() {
    return {
      insertDocImage:
        (attrs, pos) =>
        ({ commands, state }) => {
          const { $to } = state.selection
          // Never split a code block with an image: put it after the block instead.
          const at = pos ?? ($to.parent.type.name === 'codeBlock' ? $to.after() : $to.pos)
          return commands.insertContentAt(at, { type: this.name, attrs })
        },
    }
  },
})
