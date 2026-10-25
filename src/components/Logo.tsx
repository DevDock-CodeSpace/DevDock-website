import markUrl from '../../brand/devdock-mark.svg?no-inline'
import wordmarkDarkUrl from '../../brand/devdock-wordmark-dark.svg?no-inline'
import wordmarkUrl from '../../brand/devdock-wordmark.svg?no-inline'
import { cn } from '@/lib/utils'

// The logo files live in /brand (see brand/README.md); Vite serves them as separate, cached files.
// Size with a height class; width follows the intrinsic aspect ratio.

/** DevDock icon. Decorative: pair it with the wordmark or visible text. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={markUrl}
      alt=""
      width={256}
      height={221}
      draggable={false}
      className={cn('h-8 w-auto shrink-0 select-none', className)}
    />
  )
}

/** "DevDock" wordmark. Swaps to the light-text version in dark mode. */
export function LogoWordmark({ className }: { className?: string }) {
  const base = 'h-5 w-auto shrink-0 select-none'
  return (
    <>
      <img
        src={wordmarkUrl}
        alt="DevDock"
        width={1362}
        height={246}
        draggable={false}
        className={cn(base, 'dark:hidden', className)}
      />
      <img
        src={wordmarkDarkUrl}
        alt="DevDock"
        width={1362}
        height={246}
        draggable={false}
        className={cn(base, 'hidden dark:block', className)}
      />
    </>
  )
}
