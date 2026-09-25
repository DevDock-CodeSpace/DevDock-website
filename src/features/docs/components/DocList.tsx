import { FileText } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PersonAvatar } from '@/components/PersonRow'
import { timeAgo } from '@/lib/format'
import type { DocSummary } from '../api'
import { DocScope } from './DocScope'

type DocListProps = {
  docs: DocSummary[]
  /** Where each row links to. */
  href: (doc: DocSummary) => string
  /** Team view: show which workspace (or Team-wide) each doc belongs to. */
  showScope?: boolean
  empty: ReactNode
}

/** Dense, hairline-separated doc list (title | scope | author | updated). */
export function DocList({ docs, href, showScope = false, empty }: DocListProps) {
  const [now] = useState(Date.now)
  const columns = showScope
    ? 'md:grid-cols-[minmax(0,1fr)_200px_160px_96px]'
    : 'md:grid-cols-[minmax(0,1fr)_160px_96px]'

  if (docs.length === 0) {
    return <div className="border-y py-10 text-center text-sm text-muted-foreground">{empty}</div>
  }

  return (
    <div className="border-y">
      <div
        className={`hidden gap-4 border-b px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground md:grid ${columns}`}
      >
        <span>Title</span>
        {showScope && <span>Scope</span>}
        <span>Author</span>
        <span className="text-right">Updated</span>
      </div>
      <ul className="divide-y">
        {docs.map((doc) => (
          <li key={doc.id}>
            <Link
              to={href(doc)}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none ${columns}`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{doc.title}</span>
              </span>
              {showScope && (
                <span className="col-start-1 row-start-2 min-w-0 pl-6.5 md:col-start-auto md:row-start-auto md:pl-0">
                  <DocScope doc={doc} />
                </span>
              )}
              <span className="hidden min-w-0 items-center gap-2 md:flex">
                <PersonAvatar profile={doc.author} className="size-5" />
                <span className="truncate text-xs text-muted-foreground">
                  {doc.author?.display_name ?? 'Former member'}
                </span>
              </span>
              <span className="text-right font-mono text-xs text-muted-foreground">{timeAgo(doc.updated_at, now)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
