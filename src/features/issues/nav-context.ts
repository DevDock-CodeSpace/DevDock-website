import { createContext, useContext } from 'react'

export type MenuKind = 'status' | 'priority' | 'assignee' | 'label' | 'cycle'

type IssueNav = {
  /** The focused row/card (j/k or hover), which shortcuts act on. */
  activeId: string | null
  setActiveId: (id: string | null) => void
  /** A property menu opened by a shortcut. */
  menu: { issueId: string; kind: MenuKind } | null
  setMenu: (menu: { issueId: string; kind: MenuKind } | null) => void
}

export const IssueNavContext = createContext<IssueNav | null>(null)

/** Focus + menu state for one row; inert outside an IssueCollection (e.g. sub-issue lists). */
export function useRowNav(issueId: string) {
  const nav = useContext(IssueNavContext)
  const menuFor = (kind: MenuKind) => ({
    open: nav ? nav.menu?.issueId === issueId && nav.menu.kind === kind : undefined,
    onOpenChange: nav ? (open: boolean) => nav.setMenu(open ? { issueId, kind } : null) : undefined,
  })
  return {
    active: nav?.activeId === issueId,
    focus: () => nav?.setActiveId(issueId),
    menuFor,
    /** Label/cycle menus have no visible trigger on a row; they're mounted only while open. */
    openKind: nav?.menu?.issueId === issueId ? nav.menu.kind : null,
  }
}
