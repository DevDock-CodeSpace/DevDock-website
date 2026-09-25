import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * One settings group: heading + explanation on the left, controls on the right
 * (stacked on small screens). Sections are separated by a hairline, not cards.
 */
export function SettingsSection({
  title,
  description,
  children,
  tone = 'default',
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <section className="grid gap-4 border-t py-8 first:border-t-0 first:pt-2 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      <div className="space-y-1">
        <h2 className={cn('text-sm font-semibold', tone === 'danger' && 'text-destructive')}>{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 max-w-xl">{children}</div>
    </section>
  )
}

/** A destructive action row inside the danger section: explanation + button. */
export function DangerRow({ title, description, action }: { title: string; description: string; action: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between [&+&]:border-t">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}
