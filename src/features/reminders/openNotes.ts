// Opens the header's Notes panel from anywhere (the due-note watcher, later others) without a URL
// change: a search-param change would re-run the page's loaders.

const EVENT = 'devdock:open-notes'

export type OpenNotesRequest = {
  /** A note to scroll to and outline. */
  noteId?: string
  /** Opened by Calsko, not by a click: slide in without taking focus or covering the page. */
  quiet?: boolean
}

export function openNotes(request: OpenNotesRequest = {}) {
  window.dispatchEvent(new CustomEvent<OpenNotesRequest>(EVENT, { detail: request }))
}

export function onOpenNotes(listener: (request: OpenNotesRequest) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<OpenNotesRequest>).detail ?? {})
  window.addEventListener(EVENT, handle)
  return () => window.removeEventListener(EVENT, handle)
}
