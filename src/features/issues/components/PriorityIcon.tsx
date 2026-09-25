import { cn } from '@/lib/utils'
import type { IssuePriority } from '../api'

/** Linear-style priority glyph: dashes (none), "!" tile (urgent), or 3 signal bars (high/medium/low). */
export function PriorityIcon({ priority, className }: { priority: IssuePriority; className?: string }) {
  const common = { width: 14, height: 14, viewBox: '0 0 14 14', 'aria-hidden': true, className: cn('shrink-0', className) }
  if (priority === 0) {
    return (
      <svg {...common} className={cn(common.className, 'text-muted-foreground')}>
        {[1.5, 6, 10.5].map((x) => (
          <rect key={x} x={x} y="6.25" width="2.5" height="1.5" rx="0.5" fill="currentColor" />
        ))}
      </svg>
    )
  }
  if (priority === 1) {
    return (
      <svg {...common} className={cn(common.className, 'text-orange-500')}>
        <rect x="0.5" y="0.5" width="13" height="13" rx="3" fill="currentColor" />
        <path d="M7 3.5 V8" className="stroke-background" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="7" cy="10.4" r="1" className="fill-background" />
      </svg>
    )
  }
  const filled = { 2: 3, 3: 2, 4: 1 }[priority]
  return (
    <svg {...common} className={cn(common.className, 'text-foreground/80')}>
      {[
        { x: 1.5, h: 5 },
        { x: 6, h: 8.5 },
        { x: 10.5, h: 12 },
      ].map((bar, i) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={13 - bar.h}
          width="2.5"
          height={bar.h}
          rx="0.75"
          fill="currentColor"
          opacity={i < filled ? 1 : 0.25}
        />
      ))}
    </svg>
  )
}
