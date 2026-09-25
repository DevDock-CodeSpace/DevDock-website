import type { Editor } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import FileHandler from '@tiptap/extension-file-handler'
import Highlight from '@tiptap/extension-highlight'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'
import { IMAGE_TYPES } from '@/features/docs/api'
import { CollapsibleHeadings } from './CollapsibleHeadings'
import { DocImage } from './DocImage'

// highlight.js (the same highlighter Dropbox Paper uses), via lowlight; ~35 common languages, auto-detected.
const lowlight = createLowlight(common)

type Options = {
  editable: boolean
  /** Upload dropped/pasted image files and insert them (at `pos` when dropped). Omit to disallow images. */
  onImageFiles?: (editor: Editor, files: File[], pos?: number) => void
  /** Empty-editor placeholder. */
  placeholder?: string
}

export function docExtensions({
  editable,
  onImageFiles,
  placeholder = 'Start writing, or press + to add headings, code, images…',
}: Options) {
  return [
    StarterKit.configure({
      codeBlock: false, // replaced by CodeBlockLowlight
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: !editable,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
      dropcursor: { color: 'var(--brand)', width: 2 },
    }),
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    DocImage,
    CollapsibleHeadings,
    ...(editable
      ? [
          Placeholder.configure({
            placeholder: ({ editor, node }) => {
              if (node.type.name === 'heading') return `Heading ${node.attrs.level as number}`
              return editor.isEmpty ? placeholder : ''
            },
            showOnlyCurrent: true,
          }),
          ...(onImageFiles
            ? [
                FileHandler.configure({
                  allowedMimeTypes: IMAGE_TYPES,
                  onPaste: (editor, files) => onImageFiles(editor, files),
                  onDrop: (editor, files, pos) => onImageFiles(editor, files, pos),
                }),
              ]
            : []),
        ]
      : []),
  ]
}
