import { lazy, type ComponentType } from 'react'

/**
 * `lazy()`, plus a `preload()` to start the download early: from a route loader (alongside the
 * page's data, not after it) or from a hover. Once loaded, the component renders without
 * suspending. Plain `lazy()` suspends on its first render even when the code has already
 * arrived, and React then holds the reveal back about 300 ms (its fallback throttle): that was
 * most of the wait when opening a doc, a whiteboard, an issue, a lesson or a panel.
 */
export function preloadable<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let loaded: { default: ComponentType<P> } | undefined
  let pending: Promise<{ default: ComponentType<P> }> | undefined
  const preload = () => (pending ??= load().then((module) => (loaded = module)))
  const Component = lazy(() =>
    loaded
      ? // A thenable that answers at once: React.lazy then has the component on this very render.
        ({ then: (resolve: (module: { default: ComponentType<P> }) => void) => resolve(loaded!) } as unknown as Promise<{ default: ComponentType<P> }>)
      : preload(),
  )
  return { Component, preload }
}
