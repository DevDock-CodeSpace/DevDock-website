// The whole admin console is one lazy chunk: one entry per page made the bundler regroup code the
// pages share with the app into new chunks, adding ~4 KB to everyone's first load.
export { AdminFlagsPage } from './AdminFlagsPage'
export { AdminGroupsPage } from './AdminGroupsPage'
export { AdminLayout } from './AdminLayout'
export { AdminOverviewPage } from './AdminOverviewPage'
export { AdminUsersPage } from './AdminUsersPage'
