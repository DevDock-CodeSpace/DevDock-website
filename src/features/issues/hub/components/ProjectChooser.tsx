import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { HubProject } from '../hooks'

/**
 * A hub button that goes into one project: straight there when there is only one, else a menu asking
 * which (the owner's "don't ask when there's one project").
 */
export function ProjectChooser({
  projects,
  to,
  label,
  children,
  variant = 'outline',
}: {
  projects: HubProject[]
  to: (projectId: string) => string
  /** The menu's question, e.g. "New issue in…". */
  label: string
  children: ReactNode
  variant?: 'outline' | 'default'
}) {
  const navigate = useNavigate()
  if (projects.length === 0) return null
  if (projects.length === 1) {
    return (
      <Button asChild size="sm" variant={variant}>
        <Link to={to(projects[0].id)}>{children}</Link>
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant={variant}>{children}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{label}</DropdownMenuLabel>
        {projects.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => void navigate(to(p.id))}>
            {p.title}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
