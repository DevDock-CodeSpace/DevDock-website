import { preloadable } from '@/lib/preloadable'

/** The doc editor (TipTap + highlight.js): loaded with the doc's data by docLoader. */
export const docView = preloadable(() => import('./components/DocView'))
