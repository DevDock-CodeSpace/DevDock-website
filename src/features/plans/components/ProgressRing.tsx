import { cn } from '@/lib/utils'

/** A small SVG progress ring (the plan list's and the plan page's). Brand blue, green when done. */
export function ProgressRing({ ratio, size = 22, stroke = 3, className, children }: { ratio: number; size?: number; stroke?: number; className?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const done = ratio >= 1
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.min(1, Math.max(0, ratio))} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={cn('transition-[stroke-dasharray] duration-500', done ? 'stroke-green-500' : 'stroke-brand')}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  )
}
