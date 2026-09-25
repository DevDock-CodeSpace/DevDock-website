import type { LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'

/** Placeholder for course sections whose data model doesn't exist yet. */
export function ComingSoonPage({ title, icon: Icon, description }: { title: string; icon: LucideIcon; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
        <Icon className="size-8 text-muted-foreground" />
        <p className="font-medium">Not available yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </>
  )
}
