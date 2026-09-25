import { useQuery } from '@tanstack/react-query'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { AlignCenter, AlignLeft, ImageOff } from 'lucide-react'
import { docImageUrlQuery } from '@/features/docs/api'
import { cn } from '@/lib/utils'
import type { ImageAlign, ImageWidth } from './DocImage'

const widths: Record<ImageWidth, { label: string; className: string }> = {
  small: { label: 'S', className: 'w-full sm:w-1/3' },
  medium: { label: 'M', className: 'w-full sm:w-2/3' },
  full: { label: 'L', className: 'w-full' },
}

/** Renders a doc image from a signed URL; when selected (and editable) shows size/align controls. */
export function DocImageView({ node, updateAttributes, selected, editor }: ReactNodeViewProps) {
  const path = typeof node.attrs.path === 'string' ? node.attrs.path : ''
  const width = (node.attrs.width as ImageWidth) in widths ? (node.attrs.width as ImageWidth) : 'full'
  const align: ImageAlign = node.attrs.align === 'left' ? 'left' : 'center'
  const url = useQuery({ ...docImageUrlQuery(path), enabled: path !== '' })
  const editing = editor.isEditable && selected

  return (
    <NodeViewWrapper className={cn('my-5 flex', align === 'center' ? 'justify-center' : 'justify-start')}>
      <figure className={cn('relative', widths[width].className)} data-drag-handle>
        {url.data ? (
          <img
            src={url.data}
            alt={typeof node.attrs.alt === 'string' ? node.attrs.alt : ''}
            draggable={false}
            className={cn('block w-full rounded-[3px]', editing && 'outline-2 outline-offset-2 outline-brand')}
          />
        ) : url.isError ? (
          <div className="flex aspect-video w-full items-center justify-center gap-2 rounded-[3px] border text-sm text-muted-foreground">
            <ImageOff className="size-4" /> Image unavailable
          </div>
        ) : (
          <div className="aspect-video w-full animate-pulse rounded-[3px] bg-muted" />
        )}

        {editing && (
          <div
            contentEditable={false}
            className="absolute top-2 right-2 flex items-center gap-0.5 rounded-md bg-foreground p-1 text-background shadow-lg"
          >
            {(Object.keys(widths) as ImageWidth[]).map((w) => (
              <button
                key={w}
                type="button"
                aria-label={`Image size ${w}`}
                data-active={width === w}
                onClick={() => updateAttributes({ width: w })}
                className="h-7 min-w-7 rounded px-1.5 font-mono text-xs data-[active=true]:bg-background/20 hover:bg-background/15"
              >
                {widths[w].label}
              </button>
            ))}
            {width !== 'full' && (
              <>
                <span className="mx-1 h-4 w-px bg-background/25" aria-hidden />
                <button
                  type="button"
                  aria-label="Align left"
                  data-active={align === 'left'}
                  onClick={() => updateAttributes({ align: 'left' })}
                  className="flex size-7 items-center justify-center rounded data-[active=true]:bg-background/20 hover:bg-background/15"
                >
                  <AlignLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Align center"
                  data-active={align === 'center'}
                  onClick={() => updateAttributes({ align: 'center' })}
                  className="flex size-7 items-center justify-center rounded data-[active=true]:bg-background/20 hover:bg-background/15"
                >
                  <AlignCenter className="size-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </figure>
    </NodeViewWrapper>
  )
}
