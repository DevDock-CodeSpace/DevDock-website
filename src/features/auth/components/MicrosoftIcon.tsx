import type { ComponentProps } from 'react'

/** The Microsoft logo (four squares), per Microsoft's sign-in branding guidelines. */
export function MicrosoftIcon(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" {...props}>
      <path fill="#F25022" d="M1 1h9v9H1z" />
      <path fill="#7FBA00" d="M11 1h9v9h-9z" />
      <path fill="#00A4EF" d="M1 11h9v9H1z" />
      <path fill="#FFB900" d="M11 11h9v9h-9z" />
    </svg>
  )
}
