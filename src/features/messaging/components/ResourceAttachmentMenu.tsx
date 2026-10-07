import { useQuery } from '@tanstack/react-query'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { teamDiagramsQuery } from '@/features/diagrams/api'
import { teamDocsQuery } from '@/features/docs/api'
import { teamIssuesQuery } from '@/features/issues/api'
import { teamLiveSessionsQuery } from '@/features/live/api'
import { diagramPath, docPath, issuePath, liveSessionPath } from '@/features/teams/nav'
import { MESSAGE_ATTACHMENT_MAX_BYTES, MESSAGE_ATTACHMENT_TYPES } from '../api'

/** A DevDock page to share: shown as a link in the message (`href` is a path within the app). */
export type ResourceLink = { label: string; href: string }

export function ResourceAttachmentMenu({ teamId, teamSlug, onFiles, onLinks }: { teamId: string; teamSlug: string; onFiles: (files: File[]) => void; onLinks: (links: ResourceLink[]) => void }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<'Docs' | 'Diagrams' | 'Sessions' | 'Issues'>('Docs')
  const [selected, setSelected] = useState<{ id: string; label: string; href: string }[]>([])
  const docs = useQuery({ ...teamDocsQuery(teamId), enabled: open }).data ?? []
  const diagrams = useQuery({ ...teamDiagramsQuery(teamId), enabled: open }).data ?? []
  const live = useQuery({ ...teamLiveSessionsQuery(teamId), enabled: open }).data ?? []
  const issues = useQuery({ ...teamIssuesQuery(teamId), enabled: open }).data ?? []
  const addFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 5 || files.some((file) => file.size > MESSAGE_ATTACHMENT_MAX_BYTES || !(MESSAGE_ATTACHMENT_TYPES as readonly string[]).includes(file.type))) {
      toast.error('Choose up to five supported files, each no larger than 10 MB.')
    } else {
      onFiles(files)
      setOpen(false)
    }
    event.target.value = ''
  }
  const resources = category === 'Docs'
    ? docs.map((doc) => ({ id: doc.id, label: doc.title, href: docPath(teamSlug, doc.id, doc.workspace_id ?? undefined) }))
    : category === 'Diagrams'
      ? diagrams.map((diagram) => ({ id: diagram.id, label: diagram.title, href: diagramPath(teamSlug, diagram.id, diagram.workspace_id ?? undefined) }))
      : category === 'Sessions'
        ? live.map((session) => ({ id: session.id, label: session.title, href: liveSessionPath(teamSlug, session.id, session.workspace_id ?? undefined) }))
        : issues.map((issue) => ({ id: issue.id, label: `${issue.workspace.issue_key}-${issue.number} ${issue.title}`, href: issuePath(teamSlug, issue.workspace.id, issue.number) }))
  const toggle = (resource: { id: string; label: string; href: string }) => setSelected((current) => current.some((item) => item.id === resource.id) ? current.filter((item) => item.id !== resource.id) : [...current, resource])
  const shareSelected = () => {
    if (selected.length === 0) return
    onLinks(selected.map((item) => ({ label: item.label, href: item.href })))
    setSelected([])
    setOpen(false)
  }
  return <div className="relative"><Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" title="Attach a file or DevDock page" aria-label="Attach a file or DevDock resource" onClick={() => setOpen((current) => !current)}><Paperclip /></Button>{open && <div className="absolute right-0 bottom-full z-20 mb-2 w-80 rounded-lg border bg-popover p-2 text-popover-foreground shadow-md" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); shareSelected() } }}><label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"><Paperclip className="size-4" />Upload local files<input type="file" multiple accept={MESSAGE_ATTACHMENT_TYPES.join(',')} className="hidden" onChange={addFiles} /></label><div className="mt-2 grid grid-cols-4 gap-1 border-b pb-2">{(['Docs', 'Diagrams', 'Sessions', 'Issues'] as const).map((item) => <button key={item} type="button" className={`rounded px-1 py-1 text-xs ${category === item ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-muted'}`} onClick={() => setCategory(item)}>{item}</button>)}</div><p className="px-1 pt-2 text-xs font-medium text-muted-foreground">Select resources to share</p><div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">{resources.length === 0 ? <p className="px-1 py-3 text-xs text-muted-foreground">No accessible {category.toLowerCase()} found.</p> : resources.map((resource) => <button key={resource.id} type="button" className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${selected.some((item) => item.id === resource.id) ? 'bg-accent' : ''}`} onClick={() => toggle(resource)}><span className="size-3 rounded border">{selected.some((item) => item.id === resource.id) ? '✓' : ''}</span><span className="truncate">{resource.label}</span></button>)}</div><div className="mt-2 flex items-center justify-between border-t pt-2"><span className="text-xs text-muted-foreground">{selected.length} selected</span><Button type="button" size="xs" onClick={shareSelected} disabled={selected.length === 0}>Press Enter to share</Button></div></div>}</div>
}
