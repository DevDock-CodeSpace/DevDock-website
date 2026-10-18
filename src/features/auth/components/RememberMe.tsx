import { cn } from '@/lib/utils'

/**
 * The "Remember me" box on the sign-in pages. Unticked, the session lives in this
 * tab only and lasts up to 4 hours; ticked, every tab shares it and it lasts up to
 * 12 hours (lib/auth-storage). Either way, 15 minutes idle signs out.
 */
export function RememberMe({
  checked,
  onChange,
  disabled,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        id="remember-me"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 cursor-pointer rounded accent-brand disabled:cursor-not-allowed"
      />
      <label htmlFor="remember-me" className="cursor-pointer text-sm leading-tight select-none">
        Remember me
      </label>
    </div>
  )
}
