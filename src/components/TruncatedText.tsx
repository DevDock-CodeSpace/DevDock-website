import { useRef, useState } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Text that ends in "…" when it doesn't fit, and shows the full text in a
 * tooltip on hover or focus, but only when it's actually cut off.
 */
export function TruncatedText({
  text,
  className,
  side = 'right',
}: {
  text: string
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        const el = ref.current
        setOpen(next && !!el && el.scrollWidth > el.clientWidth)
      }}
    >
      <TooltipTrigger asChild>
        <span ref={ref} className={cn('min-w-0 truncate', className)}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-80">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
