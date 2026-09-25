import type { ShapeKind } from './model'

type ShapeSvgProps = {
  shape: ShapeKind
  width: number
  height: number
  /** Classes for the body (fill + stroke). */
  className?: string
  /** Classes for detail lines drawn over the body (cylinder rim, note fold). */
  detailClassName?: string
  strokeWidth?: number
  strokeDasharray?: string
  /** Body fill opacity (containers are translucent). */
  fillOpacity?: number
}

// Wobbly cloud outline in a 100×100 box, scaled to the node.
const CLOUD =
  'M26 86 C10 86 2 72 9 60 C1 48 11 31 27 35 C29 17 51 10 62 25 C72 12 94 21 89 40 C100 46 99 70 83 73 C85 84 72 92 62 85 C54 95 33 95 26 86 Z'

/** One shape as SVG, sized in pixels so strokes and corners never stretch. */
export function ShapeSvg({
  shape,
  width: w,
  height: h,
  className,
  detailClassName,
  strokeWidth = 1.5,
  strokeDasharray,
  fillOpacity,
}: ShapeSvgProps) {
  const i = strokeWidth // inset so the stroke isn't clipped
  const stroke = { strokeWidth, strokeDasharray, fillOpacity, vectorEffect: 'non-scaling-stroke' as const }
  const body = (() => {
    switch (shape) {
      case 'rectangle':
      case 'text':
        return <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} rx={2} className={className} {...stroke} />
      case 'rounded':
        return (
          <rect
            x={i}
            y={i}
            width={w - 2 * i}
            height={h - 2 * i}
            rx={Math.min(14, h / 4)}
            className={className}
            {...stroke}
          />
        )
      case 'ellipse':
        return <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - i} ry={h / 2 - i} className={className} {...stroke} />
      case 'diamond':
        return (
          <polygon
            points={`${w / 2},${i} ${w - i},${h / 2} ${w / 2},${h - i} ${i},${h / 2}`}
            strokeLinejoin="round"
            className={className}
            {...stroke}
          />
        )
      case 'parallelogram': {
        const s = Math.min(w * 0.2, 28)
        return (
          <polygon
            points={`${i + s},${i} ${w - i},${i} ${w - i - s},${h - i} ${i},${h - i}`}
            strokeLinejoin="round"
            className={className}
            {...stroke}
          />
        )
      }
      case 'hexagon': {
        const s = Math.min(w * 0.22, h / 2)
        return (
          <polygon
            points={`${i + s},${i} ${w - i - s},${i} ${w - i},${h / 2} ${w - i - s},${h - i} ${i + s},${h - i} ${i},${h / 2}`}
            strokeLinejoin="round"
            className={className}
            {...stroke}
          />
        )
      }
      case 'triangle':
        return (
          <polygon
            points={`${w / 2},${i} ${w - i},${h - i} ${i},${h - i}`}
            strokeLinejoin="round"
            className={className}
            {...stroke}
          />
        )
      case 'document': {
        const wave = Math.min(10, h * 0.12)
        const bottom = h - i - wave
        return (
          <path
            d={`M${i} ${i} H${w - i} V${bottom} Q${w * 0.75} ${bottom - wave} ${w / 2} ${bottom} T${i} ${bottom} Z`}
            strokeLinejoin="round"
            className={className}
            {...stroke}
          />
        )
      }
      case 'cylinder': {
        const ry = Math.min(14, h * 0.14)
        const x0 = i
        const x1 = w - i
        const y0 = i + ry
        const y1 = h - i - ry
        const rx = (x1 - x0) / 2
        return (
          <>
            <path
              d={`M${x0} ${y0} A${rx} ${ry} 0 0 1 ${x1} ${y0} V${y1} A${rx} ${ry} 0 0 1 ${x0} ${y1} Z`}
              className={className}
              {...stroke}
            />
            <path d={`M${x0} ${y0} A${rx} ${ry} 0 0 0 ${x1} ${y0}`} fill="none" className={detailClassName} {...stroke} />
          </>
        )
      }
      case 'note': {
        const f = Math.min(16, w / 4, h / 4)
        return (
          <>
            <path
              d={`M${i} ${i} H${w - i - f} L${w - i} ${i + f} V${h - i} H${i} Z`}
              strokeLinejoin="round"
              className={className}
              {...stroke}
            />
            <path
              d={`M${w - i - f} ${i} V${i + f} H${w - i}`}
              fill="none"
              strokeLinejoin="round"
              className={detailClassName}
              {...stroke}
            />
          </>
        )
      }
      case 'cloud':
        return (
          <g transform={`translate(${i} ${i}) scale(${(w - 2 * i) / 100} ${(h - 2 * i) / 100})`}>
            <path d={CLOUD} className={className} {...stroke} />
          </g>
        )
    }
  })()

  return (
    <svg width={w} height={h} className="absolute inset-0 overflow-visible" aria-hidden>
      {body}
    </svg>
  )
}
