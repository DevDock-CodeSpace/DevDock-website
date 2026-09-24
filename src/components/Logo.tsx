import markUrl from '@/assets/brand/devdock-mark.webp'
import wordmarkDarkUrl from '@/assets/brand/devdock-wordmark-dark.webp'
import wordmarkUrl from '@/assets/brand/devdock-wordmark.webp'
import { cn } from '@/lib/utils'

// Brand assets are generated from the masters in /brand (see brand/README.md).
// Size with a height class; width follows the intrinsic aspect ratio.

/** DevDock icon. Decorative: pair it with the wordmark or visible text. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={markUrl}
      alt=""
      width={808}
      height={575}
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
        width={972}
        height={169}
        draggable={false}
        className={cn(base, 'dark:hidden', className)}
      />
      <img
        src={wordmarkDarkUrl}
        alt="DevDock"
        width={972}
        height={169}
        draggable={false}
        className={cn(base, 'hidden dark:block', className)}
      />
    </>
  )
}
