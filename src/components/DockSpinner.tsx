import { useId, useState } from 'react'
import { cn } from '@/lib/utils'

// DevDock's loading spinner: a blue arc that turns and stretches around the logo's three dots,
// which swell one after another. Drawn and animated in SVG (SMIL), so it needs no CSS keyframes
// and no images. For people who asked their system for less motion it stands still.
// The dots are the logo's (brand/devdock-mark.svg), at 70% around the middle of the ring.

const DOTS = [
  { x: 148.4, y: 124.1, r: 19.25, fill: 'teal', delay: '0s' },
  { x: 182.4, y: 152.5, r: 17.85, fill: 'purple', delay: '0.2s' },
  { x: 125.7, y: 169.3, r: 25.9, fill: 'violet', delay: '0.4s' },
] as const

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Size it with a size class (default 40 px). Use for waits of a page or more; buttons keep their small
 * spinner. Pass `label={null}` when the same words are written beside it, so screen readers say them once.
 */
export function DockSpinner({ className, label = 'Loading' }: { className?: string; label?: string | null }) {
  // useId has characters (« » :) that don't belong in a url(#…) reference.
  const id = 'dock-spinner-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [still] = useState(reducedMotion)
  const g = (name: string) => `${id}-${name}`

  return (
    <svg
      viewBox="30 30 240 240"
      {...(label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      className={cn('size-10 shrink-0', className)}
    >
      <defs>
        <linearGradient id={g('ring')} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#175BFF" />
          <stop offset="1" stopColor="#038DFF" />
        </linearGradient>
        <linearGradient id={g('teal')} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop stopColor="#02D0C4" />
          <stop offset="1" stopColor="#00BDBD" />
        </linearGradient>
        <linearGradient id={g('purple')} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop stopColor="#8A56FC" />
          <stop offset="1" stopColor="#5334EC" />
        </linearGradient>
        <linearGradient id={g('violet')} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop stopColor="#7246F7" />
          <stop offset=".55" stopColor="#3775FE" />
          <stop offset="1" stopColor="#01A9FA" />
        </linearGradient>
      </defs>

      <circle
        cx="150"
        cy="150"
        r="100"
        fill="none"
        stroke={`url(#${g('ring')})`}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray="200 628"
        transform="rotate(-90 150 150)"
      >
        {!still && (
          <>
            <animateTransform attributeName="transform" type="rotate" from="0 150 150" to="360 150 150" dur="1.4s" repeatCount="indefinite" />
            <animate attributeName="stroke-dasharray" values="60 628;330 628;60 628" dur="1.4s" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" repeatCount="indefinite" />
          </>
        )}
      </circle>

      {DOTS.map((dot) => (
        <g key={dot.fill} transform={`translate(${dot.x} ${dot.y})`}>
          <circle r={dot.r} fill={`url(#${g(dot.fill)})`}>
            {!still && (
              <animateTransform
                attributeName="transform"
                type="scale"
                values="1;1.18;1;1"
                keyTimes="0;.3;.6;1"
                dur="1.2s"
                begin={dot.delay}
                repeatCount="indefinite"
              />
            )}
          </circle>
        </g>
      ))}
    </svg>
  )
}
