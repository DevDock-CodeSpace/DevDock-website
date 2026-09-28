import { GitBranch } from 'lucide-react'
import type { ReactNode } from 'react'
import { repoFullName, type Repo } from '@/features/repos/api'
import { Picker } from './Picker'

const NONE = 'none'

/** Point an issue at one of the workspace's linked repos, or none. */
export function RepoPicker({
  value,
  repos,
  onChange,
  children,
  align,
}: {
  value: string | null
  repos: Repo[]
  onChange: (repoId: string | null) => void
  children: ReactNode
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <Picker
      placeholder="Set repository…"
      align={align}
      selected={[value ?? NONE]}
      onSelect={(v) => {
        const next = v === NONE ? null : v
        if (next !== value) onChange(next)
      }}
      options={[
        { value: NONE, label: 'No repository', icon: <GitBranch className="size-3.5 text-muted-foreground" /> },
        ...repos.map((r) => ({
          value: r.id,
          label: repoFullName(r),
          icon: <GitBranch className="size-3.5 text-muted-foreground" />,
        })),
      ]}
    >
      {children}
    </Picker>
  )
}
