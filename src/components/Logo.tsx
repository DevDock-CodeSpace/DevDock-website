import markDarkUrl from '../../brand/calsko-mark-dark.svg?no-inline'
import markUrl from '../../brand/calsko-mark.svg?no-inline'
import wordmarkDarkUrl from '../../brand/calsko-wordmark-dark.svg?no-inline'
import wordmarkUrl from '../../brand/calsko-wordmark.svg?no-inline'
import { cn } from '@/lib/utils'

// The logo files live in /brand (see brand/README.md); Vite serves them as separate, cached files.
// Size with a height class; width follows the intrinsic aspect ratio.

/** Calsko icon (black, white in dark mode). Decorative: pair it with the wordmark or visible text. */
export function LogoMark({ className }: { className?: string }) {
  const base = 'h-8 w-auto shrink-0 select-none'
  return (
    <>
      <img src={markUrl} alt="" width={655} height={788} draggable={false} className={cn(base, 'dark:hidden', className)} />
      <img src={markDarkUrl} alt="" width={655} height={788} draggable={false} className={cn(base, 'hidden dark:block', className)} />
    </>
  )
}

/** "Calsko" wordmark. Swaps to the light-text version in dark mode. */
export function LogoWordmark({ className }: { className?: string }) {
  const base = 'h-5 w-auto shrink-0 select-none'
  return (
    <>
      <img
        src={wordmarkUrl}
        alt="Calsko"
        width={1720}
        height={424}
        draggable={false}
        className={cn(base, 'dark:hidden', className)}
      />
      <img
        src={wordmarkDarkUrl}
        alt="Calsko"
        width={1720}
        height={424}
        draggable={false}
        className={cn(base, 'hidden dark:block', className)}
      />
    </>
  )
}
