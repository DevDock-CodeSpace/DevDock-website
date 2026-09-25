import { cn } from '@/lib/utils'
import type { IssueStatus } from '../api'

/** Pie slice from 12 o'clock, clockwise, covering `fraction` of a circle. */
function pie(cx: number, cy: number, r: number, fraction: number) {
  const angle = fraction * 2 * Math.PI
  const x = cx + r * Math.sin(angle)
  const y = cy - r * Math.cos(angle)
  return `M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 ${fraction > 0.5 ? 1 : 0} 1 ${x} ${y} Z`
}

/** Linear-style status glyph: dashed (backlog), empty, half, three-quarter, checked, crossed. */
export function StatusIcon({ status, className }: { status: IssueStatus; className?: string }) {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true, className: cn('shrink-0', className) }
  switch (status) {
    case 'backlog':
      return (
        <svg {...common} className={cn(common.className, 'text-muted-foreground')}>
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="1.4 1.74" />
        </svg>
      )
    case 'todo':
      return (
        <svg {...common} className={cn(common.className, 'text-muted-foreground')}>
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'in_progress':
    case 'in_review':
      return (
        <svg
          {...common}
          className={cn(common.className, status === 'in_progress' ? 'text-amber-500' : 'text-green-500')}
        >
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d={pie(7, 7, 3.5, status === 'in_progress' ? 0.5 : 0.75)} fill="currentColor" />
        </svg>
      )
    case 'done':
      return (
        <svg {...common} className={cn(common.className, 'text-brand')}>
          <circle cx="7" cy="7" r="7" fill="currentColor" />
          <path d="M4.2 7.2 L6.1 9 L9.8 5.2" fill="none" className="stroke-background" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'canceled':
      return (
        <svg {...common} className={cn(common.className, 'text-muted-foreground')}>
          <circle cx="7" cy="7" r="7" fill="currentColor" />
          <path d="M4.8 4.8 L9.2 9.2 M9.2 4.8 L4.8 9.2" className="stroke-background" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )
  }
}
