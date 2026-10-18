import type { NodeProps } from '@xyflow/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { bgClass, borderClass } from './colors'
import { useDiagramEditor } from './context'
import { bodyEditId, parseColumn } from './blocks'
import { EditableText } from './EditableText'
import type { DiagramNode, TextSize } from './model'
import { NodeFrame } from './NodeFrame'

const headingSize: Record<TextSize, string> = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl' }
const titleSize: Record<TextSize, string> = { sm: 'text-sm', md: 'text-base', lg: 'text-lg' }
const bodySize: Record<TextSize, string> = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }

const lines = (text: string | undefined) => (text ?? '').split('\n').filter((l) => l.trim() !== '')

/**
 * Text blocks (a heading; a sub-heading with a paragraph or bullet points) and a
 * database table. They grow with their text; only the width is dragged. Double-click
 * the heading or the body to edit it.
 */
export function BlockNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const { readOnly, editingId, setEditingId, updateNode } = useDiagramEditor()
  const block = data.block ?? 'paragraph'
  const size = data.text
  const border = data.line === 'none' ? 'border-transparent' : cn(borderClass[data.stroke], data.line === 'dashed' && 'border-dashed')

  const editable = (field: 'label' | 'body', view: ReactNode, className?: string) => {
    const editId = field === 'label' ? id : bodyEditId(id)
    const value = (field === 'label' ? data.label : data.body) ?? ''
    if (editingId === editId) {
      return (
        <EditableText
          value={value}
          multiline={field === 'body'}
          className={cn('w-full', className)}
          onDone={(next) => {
            setEditingId(null)
            if (next !== null && next !== value) updateNode(id, field === 'label' ? { label: next } : { body: next })
          }}
        />
      )
    }
    return (
      <div
        className={className}
        onDoubleClick={(e) => {
          if (readOnly) return
          e.stopPropagation()
          setEditingId(editId)
        }}
      >
        {view}
      </div>
    )
  }

  const heading = (className: string) =>
    editable('label', <span className="block whitespace-pre-wrap break-words">{data.label || ' '}</span>, cn(className, data.bold && 'font-semibold'))

  if (block === 'table') {
    const rows = lines(data.body).map(parseColumn)
    return (
      <NodeFrame selected={selected} widthOnly minWidth={140}>
        <div className={cn('overflow-hidden rounded-md border bg-background text-foreground', border)}>
          {heading(cn('border-b px-2.5 py-1.5 font-mono text-sm font-semibold', bgClass[data.fill], border))}
          {editable(
            'body',
            rows.length === 0 ? (
              <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Double-click to add columns</p>
            ) : (
              <table className="w-full border-collapse font-mono text-xs">
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="w-8 py-1 pl-2 align-top">
                        {row.keys.map((k) => (
                          <span
                            key={k}
                            className={cn(
                              'mr-0.5 inline-block rounded-sm px-1 text-[9px] leading-4 font-semibold',
                              k === 'PK' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-brand/10 text-brand',
                            )}
                          >
                            {k}
                          </span>
                        ))}
                      </td>
                      <td className="py-1 pr-2 align-top break-all">{row.name}</td>
                      <td className="py-1 pr-2.5 text-right align-top break-all text-muted-foreground">{row.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ),
            'min-h-6 font-mono text-xs',
          )}
        </div>
      </NodeFrame>
    )
  }

  return (
    <NodeFrame selected={selected} widthOnly minWidth={60}>
      <div className={cn('rounded-md border px-2 py-1.5 text-left text-foreground', bgClass[data.fill], border)}>
        {block === 'heading' ? (
          heading(cn('leading-tight tracking-tight', headingSize[size]))
        ) : (
          <>
            {heading(cn('leading-snug', titleSize[size]))}
            {editable(
              'body',
              block === 'list' ? (
                <ul className="list-disc space-y-0.5 pl-4">
                  {lines(data.body).map((item, i) => (
                    <li key={i} className="break-words">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="whitespace-pre-wrap break-words">{data.body}</p>
              ),
              cn('mt-1 min-h-4 leading-relaxed text-foreground/80', bodySize[size]),
            )}
          </>
        )}
      </div>
    </NodeFrame>
  )
}
