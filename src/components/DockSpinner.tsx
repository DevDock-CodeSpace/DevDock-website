import { useState } from 'react'
import spinnerUrl from '../../brand/calsko-spinner.svg?no-inline'
import { LogoMark } from '@/components/Logo'
import { cn } from '@/lib/utils'

// Calsko's loading spinner: the logo's swirl turns once like a whirlpool, rests, and turns again.
// The animation (SMIL) lives in brand/calsko-spinner.svg, served as its own cached file, so the
// logo's outline (5 KB) stays out of the first-load JavaScript. It is drawn black and inverted to
// near-white in dark mode. For people who asked their system for less motion it is the still logo.

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Size it with a size class (default 40 px). Use for waits of a page or more; buttons keep their small
 * spinner. Pass `label={null}` when the same words are written beside it, so screen readers say them once.
 */
export function DockSpinner({ className, label = 'Loading' }: { className?: string; label?: string | null }) {
  const [still] = useState(reducedMotion)
  const a11y = label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label }

  if (still) {
    return (
      <span {...a11y} className={cn('inline-flex size-10 shrink-0 items-center justify-center', className)}>
        <LogoMark className="h-[82%]" />
      </span>
    )
  }
  return (
    <img
      src={spinnerUrl}
      alt={label ?? ''}
      aria-hidden={label === null || undefined}
      width={40}
      height={40}
      draggable={false}
      className={cn('size-10 shrink-0 select-none dark:invert', className)}
    />
  )
}
