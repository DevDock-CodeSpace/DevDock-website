import { useQuery } from '@tanstack/react-query'
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { FileText, Lock, Presentation } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { teamDocsQuery } from '@/features/docs/api'
import { useCurrentTeam } from '@/features/teams/hooks'
import { diagramPath, docPath } from '@/features/teams/nav'
import { cn } from '@/lib/utils'
import type { FileLinkKind } from './FileLink'

const chip =
  'mx-0.5 inline-flex max-w-full items-baseline gap-1 rounded-md border px-1.5 py-px align-baseline text-[0.92em] leading-normal no-underline'

/**
 * A link to a doc or diagram, as a chip with its current title. Titles come from the group's
 * doc and diagram lists (one cached, live-updated query per kind, shared by every link and by
 * Files), so a doc full of links costs at most two requests. Missing from the list means the
 * reader can't open it (RLS) or it was deleted: the chip says so without a title.
 */
export function FileLinkView({ node, selected }: ReactNodeViewProps) {
  const kind = node.attrs.kind as FileLinkKind
  const id = node.attrs.id as string
  const { team } = useCurrentTeam()
  const { workspaceId } = useParams()
  const list = useQuery(kind === 'diagram' ? teamDiagramsQuery(team.id) : teamDocsQuery(team.id))
  const item = list.data?.find((entry) => entry.id === id)
  const Icon = kind === 'diagram' ? Presentation : FileText
  const ring = selected && 'ring-2 ring-brand/60'

  let content
  if (item) {
    // Inside its own workspace, stay there; otherwise open it in the group view (which shows everything you can open).
    const inWorkspace = workspaceId !== undefined && item.workspace_id === workspaceId ? workspaceId : undefined
    const to = kind === 'diagram' ? diagramPath(team.slug, id, inWorkspace) : docPath(team.slug, id, inWorkspace)
    content = (
      <Link
        to={to}
        draggable={false}
        title={`Open ${kind} “${item.title}”`}
        // `!`: the editor styles every <a> as a blue underlined link; a chip is a neutral pill.
        className={cn(chip, 'bg-muted/50 text-foreground! no-underline! transition-colors hover:border-brand/50 hover:bg-brand/5', ring)}
      >
        <Icon className="size-3.5 shrink-0 self-center text-muted-foreground" />
        <span className="truncate font-medium">{item.title}</span>
      </Link>
    )
  } else if (list.isPending) {
    content = (
      <span className={cn(chip, 'text-muted-foreground', ring)}>
        <Icon className="size-3.5 shrink-0 self-center" />
        <span>Loading…</span>
      </span>
    )
  } else {
    content = (
      <span
        title={`This ${kind} was deleted, or you don’t have access to it.`}
        className={cn(chip, 'border-dashed text-muted-foreground', ring)}
      >
        <Lock className="size-3.5 shrink-0 self-center" />
        <span>{kind === 'diagram' ? 'Whiteboard' : 'Doc'} you can’t open</span>
      </span>
    )
  }

  return (
    <NodeViewWrapper as="span" contentEditable={false} data-file-link="">
      {content}
    </NodeViewWrapper>
  )
}
