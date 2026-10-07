// How wide the sidebar may be, and how that is remembered. Pure, so the limits are easy to test.

export const SIDEBAR_MIN = 224 // 14rem: long names still fit, and nothing overlaps
export const SIDEBAR_MAX = 448 // 28rem: wide enough for anything, still leaves room for the page
export const SIDEBAR_DEFAULT = 256 // 16rem, the shadcn default
/** The page area never gets squeezed below this by a wide sidebar (a narrow window caps the sidebar instead). */
const MIN_CONTENT = 480
const STORAGE_KEY = 'devdock-sidebar-width'

/** The widest the sidebar may be in a window this wide: the maximum, or less when the window is narrow. */
export const maxWidthFor = (viewport: number) => Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, viewport - MIN_CONTENT))

/** Keeps a width within the limits (a non-number becomes the default). */
export function clampWidth(value: number, viewport = Infinity) {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT
  return Math.round(Math.min(maxWidthFor(viewport), Math.max(SIDEBAR_MIN, value)))
}

export function readStoredWidth(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw !== null) return clampWidth(Number(raw))
  } catch {
    // Storage can be blocked; use the default.
  }
  return SIDEBAR_DEFAULT
}

export function storeWidth(width: number) {
  try {
    if (width === SIDEBAR_DEFAULT) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, String(width))
  } catch {
    // Not remembered, still applies to this visit.
  }
}
