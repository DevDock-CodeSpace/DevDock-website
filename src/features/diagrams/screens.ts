import { preloadable } from '@/lib/preloadable'

/** The whiteboard editor (React Flow): loaded with the whiteboard's data by diagramLoader. */
export const diagramView = preloadable(() => import('./components/DiagramView'))
