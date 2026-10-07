import type { ReactNode } from 'react'
import type { Json } from '@/types/database.types'

type Mark = { type?: unknown; attrs?: { href?: unknown } }
type DocNode = { type?: unknown; text?: unknown; marks?: unknown; content?: unknown }

const MAX_DEPTH = 8
const LINK_SOURCE = '\\[[^\\]]+\\]\\(https?:\\/\\/[^)]+\\)|https?:\\/\\/[^\\s<]+'
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Links, plus "@Name" for the given names (longest first, so "@Ann Lee" wins over "@Ann"). */
function splitter(mentionNames: string[]) {
  const names = [...mentionNames].filter(Boolean).sort((a, b) => b.length - a.length).map((name) => `@${escapeRegExp(name)}(?![\\p{L}\\p{N}])`)
  return new RegExp(`(${[LINK_SOURCE, ...names].join('|')})`, 'gu')
}
const safeHref = (value: unknown) => (typeof value === 'string' && /^(https?:|mailto:)/i.test(value) ? value : null)
const linkClass = 'text-brand underline underline-offset-2'

/** Plain text with bare URLs and `[label](url)` made clickable (older messages and pasted text). */
function Linkified({ text, mentionNames }: { text: string; mentionNames: string[] }) {
  return (
    <>
      {text.split(splitter(mentionNames)).map((part, index) => {
        if (part.startsWith('@') && mentionNames.some((name) => part === `@${name}`)) return <span key={index} className="rounded bg-brand/10 px-0.5 font-medium text-brand">{part}</span>
        const markdown = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
        if (markdown) return <a key={index} href={markdown[2]} target="_blank" rel="noreferrer" className={linkClass}>{markdown[1]}</a>
        if (!/^https?:\/\//.test(part)) return part
        let href = part
        let trailing = ''
        while (/[),.!?]$/.test(href)) {
          trailing = href.slice(-1) + trailing
          href = href.slice(0, -1)
        }
        return <span key={index}><a href={href} target="_blank" rel="noreferrer" className={linkClass}>{href}</a>{trailing}</span>
      })}
    </>
  )
}

function renderText(node: DocNode, key: number, mentionNames: string[]): ReactNode {
  const text = typeof node.text === 'string' ? node.text : ''
  const marks = (Array.isArray(node.marks) ? node.marks : []).filter((mark): mark is Mark => typeof mark === 'object' && mark !== null)
  const has = (type: string) => marks.some((mark) => mark.type === type)
  const link = marks.find((mark) => mark.type === 'link')
  const href = safeHref(link?.attrs?.href)
  let out: ReactNode = href ? <a href={href} target="_blank" rel="noreferrer noopener nofollow" className={linkClass}>{text}</a> : has('code') ? text : <Linkified text={text} mentionNames={mentionNames} />
  if (has('code')) out = <code className="rounded bg-muted px-1 font-mono text-[0.85em]">{out}</code>
  if (has('bold')) out = <strong>{out}</strong>
  if (has('italic')) out = <em>{out}</em>
  if (has('strike')) out = <s>{out}</s>
  return <span key={key}>{out}</span>
}

// Only these node types are drawn; anything else is skipped, so a stored body can never inject markup.
function renderNode(node: DocNode, key: number, depth: number, mentionNames: string[]): ReactNode {
  // The server only checks that a body is a JSON object, so anything can be in here.
  if (depth > MAX_DEPTH || typeof node !== 'object' || node === null) return null
  const children = (Array.isArray(node.content) ? (node.content as DocNode[]) : []).map((child, index) => renderNode(child, index, depth + 1, mentionNames))
  switch (node.type) {
    case 'text':
      return renderText(node, key, mentionNames)
    case 'hardBreak':
      return <br key={key} />
    case 'paragraph':
      return <p key={key} className="min-h-5 whitespace-pre-wrap break-words">{children}</p>
    case 'bulletList':
      return <ul key={key} className="list-disc pl-5">{children}</ul>
    case 'orderedList':
      return <ol key={key} className="list-decimal pl-5">{children}</ol>
    case 'listItem':
      return <li key={key}>{children}</li>
    case 'codeBlock':
      return <pre key={key} className="my-1 overflow-x-auto rounded bg-muted p-2 font-mono text-xs"><code>{children}</code></pre>
    default:
      return null
  }
}

/** A message, drawn from its TipTap JSON; `fallback` (the plain-text copy) is used when the body isn't a document. */
export function MessageBody({ body, fallback, mentionNames = [] }: { body: Json; fallback: string; mentionNames?: string[] }) {
  const doc = body as DocNode | null
  const blocks = doc && typeof doc === 'object' && doc.type === 'doc' && Array.isArray(doc.content) ? (doc.content as DocNode[]) : null
  return (
    <div className="text-sm break-words">
      {blocks ? blocks.map((node, index) => renderNode(node, index, 0, mentionNames)) : <p className="whitespace-pre-wrap"><Linkified text={fallback} mentionNames={mentionNames} /></p>}
    </div>
  )
}
