// User-facing auth messages. Raw Supabase/Postgres errors go to the console only.

export type LoginErrorCode = 'cancelled' | 'oauth' | 'callback' | 'session' | 'unavailable' | 'not-configured'

export const loginErrorMessages: Record<LoginErrorCode, string> = {
  cancelled: 'Sign-in was cancelled. You can try again whenever you’re ready.',
  oauth: 'Google couldn’t complete the sign-in. Please try again.',
  callback: 'We couldn’t finish signing you in. Please try again.',
  session: 'Your session couldn’t be restored. Please sign in again.',
  unavailable: 'DevDock can’t reach the sign-in service right now. Check your connection and try again.',
  'not-configured': 'Google sign-in isn’t configured for this environment yet.',
}

export function isLoginErrorCode(value: string | null): value is LoginErrorCode {
  return value !== null && value in loginErrorMessages
}

/** Thrown by the auth API with a code the UI can turn into a friendly message. */
export class AuthFlowError extends Error {
  readonly code: LoginErrorCode

  constructor(code: LoginErrorCode, options?: { cause?: unknown }) {
    super(loginErrorMessages[code], options)
    this.name = 'AuthFlowError'
    this.code = code
  }
}
