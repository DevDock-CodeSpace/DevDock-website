import { useState } from 'react'
import { formatDate } from '@/lib/format'
import type { SeriesPoint } from '../cycleStats'

const W = 320
const H = 124
const TOP = 6
const BOTTOM = 18

/** Scope, started and completed through the cycle, with a dashed line for finishing at an even pace. */
export function BurnupChart({ series, unit }: { series: SeriesPoint[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  if (series.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">The chart starts once the cycle does.</p>
  }
  const last = series.length - 1
  const peak = Math.max(1, ...series.map((p) => p.scope))
  const x = (i: number) => (last === 0 ? W / 2 : (i / last) * W)
  const y = (value: number) => TOP + (1 - value / peak) * (H - TOP - BOTTOM)
  const baseline = y(0)
  const line = (pick: (p: SeriesPoint) => number) => series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ')
  const area = (pick: (p: SeriesPoint) => number) => `${line(pick)} L${x(last)},${baseline} L${x(0)},${baseline} Z`
  const active = hover ?? last
  const point = series[active]
  const ticks = [0, Math.floor(last / 2), last].filter((v, i, all) => all.indexOf(v) === i)

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs" aria-live="polite">
        <span className="font-mono text-muted-foreground">{formatDate(point.date)}</span>
        <Legend swatch="bg-muted-foreground" label="Scope" value={point.scope} />
        <Legend swatch="bg-amber-500" label="Started" value={point.started} />
        <Legend swatch="bg-brand" label="Completed" value={point.completed} />
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Burn-up chart in ${unit}: scope ${series[last].scope}, started ${series[last].started}, completed ${series[last].completed} on ${formatDate(series[last].date)}`}
        className="h-32 w-full overflow-visible"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          if (box.width === 0) return
          const ratio = (event.clientX - box.left) / box.width
          setHover(Math.max(0, Math.min(last, Math.round(ratio * last))))
        }}
      >
        <line x1={0} x2={W} y1={baseline} y2={baseline} className="stroke-border" />
        <path d={area((p) => p.started)} className="fill-amber-500/10" />
        <path d={area((p) => p.completed)} className="fill-brand/10" />
        <line x1={x(0)} y1={baseline} x2={x(last)} y2={y(series[last].scope)} className="stroke-muted-foreground/60" strokeDasharray="3 3" />
        <path d={line((p) => p.scope)} fill="none" className="stroke-muted-foreground" strokeWidth={1.5} />
        <path d={line((p) => p.started)} fill="none" className="stroke-amber-500" strokeWidth={1.5} />
        <path d={line((p) => p.completed)} fill="none" className="stroke-brand" strokeWidth={1.5} />
        {hover !== null && <line x1={x(active)} x2={x(active)} y1={TOP} y2={baseline} className="stroke-foreground/30" />}
        {[
          ['scope', 'fill-muted-foreground'],
          ['started', 'fill-amber-500'],
          ['completed', 'fill-brand'],
        ].map(([key, fill]) => (
          <circle key={key} cx={x(active)} cy={y(point[key as 'scope' | 'started' | 'completed'])} r={2.5} className={fill} />
        ))}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="fill-muted-foreground font-mono text-[9px]">
            {formatDate(series[i].date)}
          </text>
        ))}
      </svg>
    </figure>
  )
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-sm ${swatch}`} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </span>
  )
}
