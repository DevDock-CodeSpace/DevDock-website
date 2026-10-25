import { Navigate, useLocation } from 'react-router'

/**
 * The old Diagrams list (…/diagrams): diagrams now live in Files with docs, so it opens Files on
 * the Diagrams list (?view=diagrams), or inside the folder (?folder=) a link pointed at. Diagram
 * pages keep their URLs.
 */
export function DiagramsRedirect() {
  const folder = new URLSearchParams(useLocation().search).get('folder')
  return <Navigate to={{ pathname: '../docs', search: folder ? `?folder=${folder}` : '?view=diagrams' }} relative="path" replace />
}
