# DevDock

DevDock is a private software-engineering teaching workspace for **one instructor and a small group of students** (single digits). It is not a public product. Optimize for clarity, low maintenance, and low hosting cost over scale.

## Current status

> **Naming:** the UI calls a team a **group** ("Group settings", "Group-wide", "Create or join a group"). Code, routes (`/t/:teamSlug`), query keys and the database still say **team**. Keep new user-facing text on "group"; don't rename code for it. The same goes for issue **cycles**: the UI calls them **sprints** ("Sprint 3", "Current sprint", "New sprint"), while code, routes (`…/issues/cycles`), query keys, URL params (`?cycle=`), tables and docs below still say cycle. Keep new user-facing text on "sprint".

**Phase 1 done: frontend shell.** React Router, Tailwind v4, shadcn/ui, and TanStack Query are installed. The app has a responsive sidebar layout, light/dark/system theme, and placeholder pages driven by mock data (replaced by real data in Phase 4). TipTap (Phase 5b), React Flow (Phase 5c) and the Jitsi React SDK (Phase 5d, Live) are installed. **Add each piece only when a task needs it**, and don't build ahead.

**Phase 2 done: Supabase foundation.** `@supabase/supabase-js`, a typed browser client (`src/lib/supabase.ts`), the `supabase/` CLI project, and the first migration (`profiles` + RLS + a sign-up trigger), **applied to the hosted project** (ref `ejqrrxxiatvvdiyxtvid`, linked via `supabase link`).

**Phase 3 done: Google sign-in** via Supabase Auth (PKCE). All app routes require a session, and the sidebar shows the signed-in user's profile. Sign-in verified end-to-end with a real Google account. The app now **requires** the Supabase env vars.

**Phase 4 (in progress): Team → Workspace model is real.** A **team** (owner/admin/member; type learning/development/general) contains **workspaces** (lead/member; type course/project/general). Invite codes join a team, and workspace access is assigned separately. The UI has onboarding (create a team or join with a code), a team switcher, and real workspace, member, invite and settings pages. The mock data is gone.

**Phase 5a done: Docs.** A `documents` table (team-wide or assigned to a workspace) with RLS, Team → Docs and Workspace → Docs lists.

**Phase 5b done: rich docs editor (Dropbox Paper-style).** TipTap v3 (MIT extensions only) with highlight.js via lowlight, stored as TipTap JSON in `documents.body`; images in the private `doc-images` Storage bucket. Autosave.

**Phase 5c done: Diagrams (Lucidchart-style).** A `diagrams` table (same scope and RLS rules as `documents`) holding React Flow JSON, with Team → Diagrams and Workspace → Diagrams lists and an in-app editor styled like DevDock: a shape/icon library, containers, connectors, a properties panel, undo/redo, copy/paste, alignment guides, autosave. 

**Phase 6a done: Issues (Linear-style), part 1.** Workspace-only issues with IDs like `CAP-12` (per-workspace `issue_key` + counter). Each issue has a status workflow, priority, assignee, labels, estimate, due date and sub-issues. Views are a List grouped by status and a Board with drag-and-drop; the issue page has a rich description (the Docs editor, with pasted/dropped images), sub-issues, comments and a properties panel. Any workspace member can create and edit issues. Leads and team owners/admins delete issues and manage labels and the key. 

**Phase 6b done: Issues, part 2.**
- **Cycles:** Linear's sprints, numbered per workspace and never overlapping; managers create, edit and delete them, and there's a "move open issues to the next cycle" action.
- **Views:** All / Active / Backlog / My issues tabs, and filters (status, priority, assignee, labels, cycle) kept in the URL.
- **Activity log:** written by DB triggers and shown with comments as an Activity feed.
- **Keyboard shortcuts:** Linear-style; press `?` for the list.

**Phase 5d done: Live sessions (Jitsi via JaaS).** A `live_sessions` table (same scope and RLS rules as `documents`) for scheduled video calls. The `@jitsi/react-sdk` `JaaSMeeting` is embedded and lazy-loaded; the room is only reachable with a short-lived RS256 JaaS JWT minted by the `jaas-token` Edge Function (which re-checks access under RLS and a moderator flag). Scheduling a session can create a Google Calendar event that invites everyone in the audience, using the organizer's Google token (re-obtained through OAuth about once an hour, since there's no server to hold a refresh token). Team → Live and Workspace → Live lists, a session page with Join/edit/cancel/calendar sync, and an embedded call.

**Phase 8 done: Learning** (modules → lessons → progress).

**Phase 9a done: GitHub repos, part 1** (no GitHub API yet). Repos belong to the group and are linked to any number of projects. An issue can point at one repo linked to its project (like a label), so moving an issue into a repo never changes its number. Group settings → Repositories, the project's GitHub tab, and a Repo property, filter and chip on issues. 

**Phase 9b done (needs the App's keys to be used): GitHub App connection.** Group owners/admins install the DevDock GitHub App from Group settings. The `github` Edge Function verifies the install with GitHub (the one-time OAuth code proves the person can access that installation), then saves it to `github_installations`. After that, repos are picked from what the App can see. Setup: README → GitHub App setup.

**Phase 9c/9d done: branches and PR webhooks (rules agreed with the product owner).**
- **Branches:** moving an issue to **In Progress** creates its branch (`dock/wa-2-add-login`) on GitHub. It uses the `github` function's `create_branch`, called from `useUpdateIssue` through `useCreateIssueBranch`, and starts from the project's base branch. The issue page's **Development** block offers **Create branch** to retry.
- **PR webhooks:** the `github-webhook` Edge Function moves issues:
  - PR opened or ready for review → **In Review** (drafts don't move issues);
  - closed without merging → back to In Progress;
  - merged into one of the project's **done branches** (per linked repo, set on the GitHub tab; none = the default branch) → **Done**;
  - merged into another branch (feature → `dev`) → the PR is **tracked** (`issue_pull_requests.landed_ref`). When that branch is merged onwards by a later PR (`dev` → `prod`), the tracked PRs move with it, and their issues become **Done** once they reach a done branch.
- Activity shows "GitHub" as the actor.
- **Status lock:** on issues whose repo is connected, only GitHub (`devdock.via = 'github'`) or workspace managers can set In Review or Done (`check_issue`, SQLSTATE `DD001`, message in `writeErrors`). Everyone can still reopen an issue or cancel it.
- **Merged branches:** GitHub deletes them (the repo's "Automatically delete head branches" setting); the Development block shows them as merged and links to the PR.

**Issue views done:** saved views (a name + tab + layout + filters; private or shared with the workspace), a sidebar **Pinned** section (your saved views, one person's issues, or a built-in tab), and person views (`?assignee=<id>`, from the Members page or a pin). Display options (group by, sub-group, ordering, properties) are not built.

**Messaging (team-wide chat) done, part 1:** channels (`#general` is automatic), DMs and ad-hoc groups; threads, reactions, pins, mentions, attachments, search, unread badges, mute. Design record: `docs/MESSAGING_ARCHITECTURE.md`.

Next: 9e deleting an issue can delete its branch (opt-in). Branches are never deleted when an issue moves back.

Exercises is still a placeholder page. Current status and next steps: `docs/STATUS.md`.

## Target stack

| Concern            | Choice                          | Notes |
|--------------------|---------------------------------|-------|
| UI                 | React 19 + TypeScript           | Function components + hooks only |
| Build/dev          | Vite                            | SPA, no SSR |
| Routing            | React Router                    | |
| Styling            | Tailwind CSS                    | Replaces the temporary `src/index.css` |
| Components         | shadcn/ui                       | Generated into `src/components/ui/`; uses `@/` alias |
| Server state       | TanStack Query                  | All remote data goes through queries/mutations |
| Backend            | Supabase (Postgres, Auth, Storage) | Row Level Security is the authorization layer |
| Rich text / notes  | TipTap v3 (+ lowlight/highlight.js) | Dropbox Paper look; MIT extensions only (drag handle pulls in yjs as a peer dep). Lazy-loaded with the doc page |
| Diagrams           | React Flow (`@xyflow/react`, MIT) | Own UI in DevDock's style (not an embed); stored as JSON in `diagrams.data`. Lazy-loaded with the diagram page |
| Live sessions      | Jitsi Meet via JaaS (8x8) — `@jitsi/react-sdk` embed | Room token minted server-side by the `jaas-token` Edge Function (RS256, `jose`); domain is `8x8.vc`, config from JaaS secrets. Lazy-loaded with the session page |
| Code               | GitHub App + `repos`            | Group repos linked to projects. A GitHub App connects them (the `github` Edge Function); webhooks and branches come in 9c–9e |
| Hosting            | Vercel                          | Static SPA; `vercel.json` rewrites every path except `/assets/*` to `index.html` (so a missing chunk is a real 404, not HTML) |

## Commands

```bash
npm install
npm run dev         # Vite dev server
npm run typecheck   # tsc -b (app + node configs)
npm run lint        # oxlint
npm run build       # typecheck + production build to dist/
npm run perf        # after a build: fails if the first load got heavier (budgets: scripts/check-performance.mjs)
npm run check       # everything below in one go: lint, typecheck + build, perf (CI runs this on every PR)
npm run preview     # serve dist/
npm run db:types    # regenerate src/types/database.types.ts from the linked project (Supabase CLI)
```

Supabase CLI (DB work only; the app doesn't need it): `supabase migration new <name>`, `supabase db push [--dry-run]`, `supabase migration list`. `supabase start` / `db reset` need Docker; nothing else does.

Before calling a task done, run `npm run check` (lint, typecheck + build, then the performance budget). It must pass; GitHub Actions (`.github/workflows/ci.yml`) runs the same command on every pull request to `dev` and `prod`.

## Performance (read before coding)

The app is fast on purpose, and that has to stay true. **Before writing code that fetches data, adds a route, list, query, dependency or editor, read `.claude/skills/devdock-performance/SKILL.md`** and follow it: no request waterfalls (prefetch in loaders, `useSuspenseQueries`), no N+1, lazy-load anything heavy, keep first-load JS within budget. **If a feature would slow things down** (extra requests on every page, more than ~10 KB gzipped on the first load, sequential round trips, unbounded lists, polling), **stop and ask the owner before implementing it**, with the cheaper options, as the skill describes.

## Conventions

- **TypeScript is strict** (TS 6 defaults to strict mode), with `noUnusedLocals`/`noUnusedParameters`/`verbatimModuleSyntax`. Use `import type` for type-only imports. Avoid `any`; prefer `unknown` + narrowing.
- **Imports:** use the `@/` alias for anything under `src/` (configured in `vite.config.ts` and `tsconfig.app.json`; keep them in sync).
- **Linting:** oxlint (`.oxlintrc.json`), not ESLint.
- **Components:** PascalCase `.tsx` files, one exported component per file. Named exports, except where a route/lazy-load needs a default.
- **Data access:** components never call Supabase directly. Go through a typed function in `src/lib/`/feature `api.ts`, wrapped in a TanStack Query hook.
- **Styling:** Tailwind utility classes. No new global CSS beyond the base layer in `src/index.css`.
- Keep dependencies lean. Ask before adding libraries outside the target stack.

### Layout (create new folders only when needed)

```
src/
  main.tsx           # providers: QueryClient → Theme → Tooltip → Router
  router.tsx         # all routes (createBrowserRouter, data mode)
  layouts/           # AppLayout (team shell: sidebar + header + <Suspense><Outlet/>), app-loader.ts (auth guard)
  routes/            # page components: team/* (under /t/:teamSlug) and workspace/* (under …/w/:workspaceId)
  features/<name>/   # feature-scoped components, types, api.ts, hooks (auth/, teams/, workspaces/, docs/, diagrams/, issues/, repos/, …)
  components/ui/     # shadcn/ui generated components (don't hand-edit much)
  components/        # shared app components (AppSidebar, PageHeader, Theme*)
  hooks/             # shared hooks
  lib/               # queryClient, supabase client, utils
  types/             # database.types.ts (generated by `npm run db:types`; never hand-edit)
supabase/
  config.toml        # CLI + local-stack config
  migrations/        # <timestamp>_<name>.sql, the source of truth for the schema
```

### Routing & data

- **Routes.**
  - Public: `/login`, `/admin-login` (the admin account's password sign-in), `/auth/callback`, `/privacy` (privacy policy for Google's consent screen; keep it matching what the app stores).
  - Authenticated (under route id `app`):
    - `/app` redirects to the last-used team, or to `/onboarding` when the user has none.
    - `/onboarding`
    - `/github/callback` (back from installing the GitHub App).
    - `/t/:teamSlug` (the team's workspaces), plus `members` and `settings`.
    - `/t/:teamSlug/w/:workspaceId` (overview), plus `members` and `settings`; every other feature tab is `:tab`, checked against the workspace type in `WorkspaceTabPage`.
  - `/` redirects to `/app`.
- **Access checks in loaders** (`features/teams/loaders.ts`): `teamLoader` 404s when the user isn't a team member; `workspaceLoader` 404s when the workspace isn't visible (RLS) or belongs to another team.
- **Current context:** `useCurrentTeam()` and `useCurrentWorkspace()` (`features/teams/hooks.ts`) return the entity, the user's role, and `can`, a permissions object from `features/teams/permissions.ts` that mirrors RLS. **`can` is for showing and hiding UI only.** The Group members page explains the roles in plain words (`RoleGuide`, wording by group type); update it whenever permissions change. Every write is re-checked by RLS. Type labels and icons are in `teamTypes` and `workspaceTypes` in the same file.
- **Sidebar limits:** each type section shows at most 3 items (`pickSidebarItems`): your **pins** first (`workspace_pins`, private per user), then recently opened (localStorage, `features/workspaces/recent.ts`), falling back to recently updated. The open workspace always shows. The section title ("Courses · N") links to Home `?type=`. Long names use `TruncatedText` (tooltip only when cut off).
- **Navigation:** the **sidebar is the hierarchy**: team switcher, Home, the **team tools** (Docs, Diagrams, Live; `TEAM_TOOLS`), the team's workspaces grouped by **workspace** type (Courses, Projects, Workspaces; empty sections hidden; the group type decides which section comes first, the default for "+ New", and **which types are allowed**: `allowedWorkspaceTypes` (learning: course/project/space; development: project/space, **no courses**; general: all), enforced by `private.check_workspace_type`/`check_team_type`. The `general` type is labelled **Space** in the UI. Development groups also get a group-wide **Issues** item below Live (`TeamIssuesPage`, `teamIssuesQuery`)), one "+ New", team Members and Settings. **Workspace features are horizontal tabs** under the workspace title (`WorkspaceLayout`), **generated from the workspace's enabled tools** (`workspace_modules`; `getWorkspaceTabs(teamSlug, id, modules)` in `features/teams/nav.ts`): Overview, then the tools in `MODULE_ORDER`, then Members. Workspace *type* only picks default tools (`defaultModules`, which mirrors `public.default_workspace_modules`). Create workspaces with `rpc('create_workspace')` and change tools with `rpc('set_workspace_modules')`; both are atomic and run under RLS. Don't put workspace features in the sidebar.
- **Team tools vs workspace tabs:** Docs, Diagrams and Live exist at both levels as views of the same data. Rows have `team_id` (required) + `workspace_id` (nullable: null = team-wide; composite FK `(workspace_id, team_id) → workspaces(id, team_id)` keeps it in the same team). The team page shows everything the caller can access; the workspace tab shows only that workspace's rows. Docs, Diagrams and Live are built this way (`documents`/`diagrams`/`live_sessions`, `Team…Page`/`Workspace…Page`, one `DocPage`/`DiagramPage`/`LiveSessionPage` for both routes, `docLoader`/`diagramLoader`/`liveSessionLoader`). The "New …" dialog is the shared `CreateInScopeDialog` (Live uses its own `ScheduleSessionDialog`). Built workspace tools sit under `WorkspaceToolGate`, which 404s when the tool is off. Issues, Learning, Exercises and GitHub are workspace-only. **Resources was retired** (Docs with folders replaces it): the `'resources'` enum value remains in the database but is blocked by `workspace_modules_no_resources`, and `WorkspaceModule` excludes it.
- **Issues** (`features/issues/`, routes `…/w/:id/issues` (`?view=board`) and `…/issues/:issueNumber`, `issueLoader`):
  - **Loading:** the `issues` route has a loader (`issuesLoader`) that prefetches members, labels, sprints, repos, saved views and (except on a single issue's page) the issue list in parallel, and `useIssueContext` reads its four queries as one batch. Keep new Issues-page data in that loader so the page never loads it one request at a time.
  - Rows are addressed by **number within the workspace**, not UUID. The identifier is `issueIdentifier(workspace.issue_key, number)`.
  - `number`, `team_id` and `created_by` are set by DB triggers (`private.issue_counters`). The assignee-is-a-member, same-workspace-parent and no-loop rules are enforced by the `check_issue` trigger.
  - Labels on an issue are replaced with `rpc('set_issue_labels')`.
  - **Images in descriptions** (`images.ts`): the docs `docImage` node, stored in the same `doc-images` bucket under `issues/<workspace_id>/<file>` (Storage RLS: workspace viewers view and upload; the uploader or a manager deletes). The issue page uploads on paste/drop/pick; the New issue dialog keeps picked files locally and uploads them on Create, appended after the text. `deleteIssue` removes the description's images.
  - Field edits go through `useUpdateIssue()` (optimistic, rolls back with a toast). Pickers use the searchable `Picker` popover.
  - The issue page's title and description save themselves (`hooks/use-save-on-exit.ts`): while typing, on leaving the issue, and when the tab is hidden or closed. `useUpdateIssue` runs saves one at a time (mutation `scope`); `IssueDescription` queues its own saves, writes the cache when a save starts, and takes a changed server description only when nothing is unsaved.
  - `useIssueContext().canManage` mirrors `private.can_manage_workspace` (UI only).
  - Cycles live under `…/issues/cycles[/:cycleNumber]` (`cycleLoader`). Numbering and the no-overlap rule are enforced by the `prepare_issue_cycle` trigger; `rpc('move_open_issues')` rolls open issues over.
  - `issue_activity` is written only by triggers (`log_issue_activity`, `log_issue_label_activity`); clients can only read it. Don't add client-side activity writes.
  - Views are URL state: `?tab=`, filter facets (`readFilters`/`writeFilters`, `useIssueFilters`, which reads the URL directly and composes quick successive changes), `?view=board`.
  - **Saved views** (`issue_views`, `views.ts`/`viewsApi.ts`/`viewsHooks.ts`, components `ViewsMenu`/`OpenViewTab`/`ViewActions`/`ViewDialog`): opening one copies its state into the URL (`viewHref`, `?v=<id>&tab=…&status=…`), so the URL stays the single source of truth; "modified" is the URL differing from the saved state (`sameViewState`), and Save changes / Reset / Save as new act on that. A bare `?v=` link is filled in once (`useActiveView`). Visible to the owner, or to the workspace when `shared`; owners edit them, and workspace managers can edit or delete shared ones but cannot make someone else's view private (RLS). Names are unique per owner, at most 50 per person and workspace; `filters` is validated by `private.prepare_issue_view` (only the known facets, lists of short strings). Choosing a built-in tab leaves the view and starts fresh.
  - **Cycle insights** (`cycleStats.ts`, `CycleInsights`, `BurnupChart`, `BreakdownPanel`, `SidePanel`): a details panel beside the list on the cycle page (and on the issues list, as `ViewInsights`, with a saved view's visibility and owner), toggled with the panel button (`usePanelOpen`, remembered in localStorage, open by default on wide screens). For a cycle it shows scope / started (in progress or review) / completed, a burn-up chart, and Assignees / Labels / Priority breakdowns with completion rings; Issues or Points when estimates exist. The chart is rebuilt from `issue_activity` (`cycleHistoryQuery`: when each issue entered or left the cycle and when its status changed), so work added or removed mid-cycle shows as scope changes; canceled issues are never in scope. `cycleSeries` is pure and tested.
  - **Cycle pins:** a specific cycle (`kind='cycle'`, `cycle_id`) or "Current cycle" (`kind='current_cycle'`, no target; it points at `…/issues/cycles/current`, which resolves to whichever cycle is running). `CyclePinButton` offers both on the running cycle. Deleting a cycle removes its pins.
  - **Pins** (`issue_pins`, `PinButton`, `PinnedNav` in `AppSidebar`): kind `view` / `person` / `tab`, per person, ordered by `position` (`reorder_issue_pins`; at most 30). `PinButton` pins what's on screen: the open view, a person-only filter (`personOf`), or a plain tab; unsaved filters can't be pinned. A view pin must point at a view you can see, a person pin at someone in the group. `PinnedNav` hides pins whose view or project you can't reach and shows the project name only when the group has several. This is the one deliberate exception to "workspace features aren't sidebar items".
  - Shortcuts use `useShortcuts` (ignored while typing or while a menu/dialog is open). Lists get J/K focus and per-row menus through `IssueCollection` + `IssueNavContext`.
- **Data pattern:** `features/<name>/api.ts` exports `queryOptions` and mutation functions.
  - Loaders prime what the shell needs with `ensureQueryData`. Pages read with `useSuspenseQuery`; `AppLayout` has a Suspense boundary, so pages may also load secondary data that way.
  - Errors go through `lib/errors.ts` (`toDataError`, `requireAffected`), because RLS makes forbidden UPDATE/DELETE return 0 rows, not an error. Show them with `toast.error(errorMessage(e))`.
- **Query keys:** `['teams', …]`, `['workspaces', …]`, `['documents', …]`, `['diagrams', …]`, `['issues', …]` (built by `issueKeys`) and `['repos', …]` (`repoKeys`); invalidate by prefix after mutations.
- **Live updates** (`lib/realtime.ts`, started by `useRealtimeSync` in `AppLayout`):
  - Supabase Realtime sends row changes (checked against RLS); the client only uses the **table name** and invalidates the query prefixes in `AFFECTS`. The one exception is `messages` (`messageQueries`): the row's ids pick which conversation's queries to refetch, because chat is the busiest change (a new message refetches its timeline and the unread counts; a new reply only its conversation's threads). Row data is still never shown from an event. A new table needs an entry there **and** a migration adding it to the `supabase_realtime` publication. `live_sessions`, `team_invites`, `profiles` and the GitHub install tables are left out on purpose.
  - Invalidation waits while a mutation is running, and everything is invalidated after a reconnect. Queries also refetch on window focus when older than `staleTime` (60 s). Shell data that rarely changes and has realtime events (groups, members, the workspace list and roles, both kinds of pins, saved views, message preferences) uses `SETTLED_STALE_MS` (10 min, `lib/query-client.ts`) so returning to the tab doesn't re-request it; don't use it for a table that isn't in the publication.
  - Editors (issue description, docs, lessons, diagrams) keep a `synced` copy of what the server has: they take a changed server version only when nothing is unsaved (TipTap editors through `adoptContent` in `features/docs/editor/adopt.ts`), and after a save they cancel in-flight fetches of their own row before writing the cache. Keep both rules in any new editor. Two people typing in the same text at once is still last-write-wins, so each editor shows `OthersTypingAlert` (names from `useOthersTyping`, Realtime Presence in `lib/presence.ts`; only people who can edit join).
  - `useCurrentTeam`/`useCurrentWorkspace` throw a 404-shaped error when the group or workspace disappears while open.
- **Repos** (`features/repos/`; route `…/w/:id/github`, `WorkspaceGitHubPage`; Group settings → `TeamReposSection`):
  - `repos` belong to the group (`owner`/`name`, unique per group ignoring case); `workspace_repos` links them to projects (many-to-many, same group via composite FKs). Owners/admins add and remove repos; workspace managers link and unlink. Parse user input with `parseRepo`.
  - `issues.repo_id` must be a repo linked to the issue's workspace (`check_issue`). Unlinking clears it on that workspace's issues (`clear_unlinked_issue_repos` trigger), so invalidate `['issues']` too after unlink/delete. Changes are logged as activity kind `repo`.
  - Issue UIs read the workspace's linked repos from `useIssueContext().repos` and hide repo controls while there are none.
  - **PR webhooks** (`github-webhook` Edge Function, `verify_jwt = false`, HMAC via `GITHUB_WEBHOOK_SECRET`, `github_webhook_deliveries` dedupe):
    - Repos are matched by `github_repo_id` **and** the event's installation. Issues are found by key and number among the projects linked to that repo, **or** by the PR's head branch matching a stored `issue_branches.name` (so renaming a key doesn't break old branches).
    - All DB work is one call to `github_apply_pull_request()` (service role only). It upserts `issue_pull_requests`, logs `pr_linked`/`pr_merged`/`pr_closed`, and moves the status. It sets `devdock.via = 'github'`, so `log_issue_activity` tags rows with `via`.
    - Only a **change** in PR state moves an issue, so it never fights a manual status change.
    - **Tracking:** when a merged PR's head branch is in the same repo and isn't a done branch, the webhook calls `github_promote_merged()` per project. It moves `landed_ref` from the head branch to the base branch on that project's merged PRs, and marks their issues Done if the base is a done branch. It skips issues that are done or canceled, have another PR open, or whose status a person changed after the merge. Direct pushes (no PR) aren't tracked.
    - Also handles `installation.deleted` and `installation_repositories` (marks repos connected / not connected).
    - Branch names come from `issueBranchName()` (`meta.ts`); the `github` function has a copy (`branchName`). Keep the two in sync.
  - **Branches** (`issue_branches`, one per issue × repo; written only by the `github` function's `create_branch`):
    - It reads the issue and links **as the caller** (RLS), uses the issue's repo or the project's only repo (and then sets it as the issue's repo), and starts from `workspace_repos.base_branch` or the default branch.
    - It adopts a branch that already exists, and is idempotent.
    - Branches are never deleted when an issue moves back.
  - **Done branches:** `workspace_repos.done_branches` (up to 10; empty = the default branch; managers edit them in `RepoBranchSettingsDialog`, with names from the `branches` action). The webhook passes `p_merged_into_done` per project.
  - **GitHub App** (`github` Edge Function, actions `connect`/`repos`/`add_repo`/`create_branch`/`branches`; client wrappers in `repos/api.ts`):
    - Only the function writes `github_installations`, `repos.github_repo_id` and `repos.installation_id`. Clients have no grants for them. It uses the service role *after* its own checks (owner/admin, and GitHub confirming access).
    - Connect flow: `rpc('start_github_connect')` returns a one-time state (30 min, tied to the person and group), then `github.com/apps/<slug>/installations/new?state=`, then `/github/callback` (`githubCallbackLoader`), then the function, then back to Group settings.
    - `installation_id` null means **Not connected** (added by name, or disconnected; the FK sets it null). Adding the same repo from GitHub connects the existing row.
    - Disconnecting only forgets the installation in DevDock; uninstalling happens on GitHub (Manage link).
- **Sidebar width:** the sidebar's right edge is a resize handle (`SidebarResizer`, a focusable `separator`): drag it, double-click to reset, or use the arrow keys (Shift = bigger steps, Home/End = the limits, Enter = reset). Limits and storage are in `lib/sidebar-width.ts` (224–448px, default 256; a narrow window caps the sidebar so the page keeps ~480px, without overwriting the saved choice); the choice is remembered in localStorage (`useSidebarWidth`) and applied through `--sidebar-width` on `SidebarProvider`. The width animation is switched off while dragging (inline `transition: none` on the sidebar container and gap). Collapsed to icons, the edge is the usual rail (click to expand); on mobile there is no handle.
- **Full-bleed pages:** the page area normally has padding and a 1200px limit (`PageArea`). A route with `handle: FULL_BLEED` (Messages), or the session page while a call is docked, switches it to full-bleed (`useFullBleed`): no padding or width limit, and the page sets its own height (`h-[calc(100svh-3rem)]`). `PageArea` and `WorkspaceLayout` keep the same elements and only change classes, because remounting the page would undock the call and flip the layout back and forth. A docked call has no frame; the floating one is the framed window.
- **Docs editor** (`features/docs/editor/`, page body `features/docs/components/DocView.tsx`, lazy-loaded by `routes/DocPage.tsx`):
  - Extensions are listed in `extensions.ts`, and the typography lives in `styles.ts` as Tailwind classes (no global CSS).
  - `documents.body` (TipTap JSON) is the source of truth; `content` is a plain-text copy written with it.
  - Images are the custom `docImage` node, which stores a Storage **path** (`<team>/<doc>/<uuid>.<ext>`), never a URL; the view signs it (`docImageUrlQuery`). Upload with `uploadDocImage`. `deleteDocument` removes the doc's image folder first.
  - Collapsed headings are per-viewer plugin state (`CollapsibleHeadings.ts`), never saved.
  - Don't add paid TipTap extensions.
- **Learning** (`features/learning/`, routes `…/w/:id/learning`, `…/learning/progress`, `…/learning/:lessonId` with `lessonLoader`):
  - Structure: `learning_modules` → `lessons` (TipTap `body`, same editor as Docs, no images) → `lesson_progress` (a lesson marked done by a user).
  - Positions: new items go last (trigger), and moving a lesson to another module puts it last. Reorder with `rpc('reorder_learning_modules')` / `rpc('reorder_lessons')`.
  - Access: managers edit the outline; everyone in the workspace reads it. You mark and unmark only your own progress; managers read everyone's (Class progress).
  - `useLearning()` gives the outline in reading order, your done set and the next lesson.
- **Doc folders** (`doc_folders`, `features/docs/{folders.ts,components/DocBrowser.tsx}`):
  - **Access:** everyone who can read docs in a scope creates and edits them, including inside folders (`private.can_edit_document`, `useCanEditDocs`). Deleting docs, moving them between folders (checked in `check_document_folder`) and managing folders stay with writers: group owners/admins and workspace leads (`private.can_write_document`, `useCanWriteDocs`, which Diagrams and Live also use).
  - Folders are per scope (group-wide or one workspace), nest **at most 3 levels** (DB trigger sets `depth`), and use the writer rules.
  - The open folder is `?folder=<id>`; `documents.folder_id` must be in the doc's scope (trigger).
  - **Moving** (writers only): docs and folders move by drag and drop, by "Move to…", or together as a multi-selection (checkboxes, Ctrl/⌘-click, Shift-click, Select all). The browser follows file-manager habits: dragging an unselected row drags just it, dragging a selected row drags the whole selection, hovering a folder for ~0.8s while dragging opens it, the path above is a drop target, and every move has an Undo toast. All moves go through `rpc('move_doc_items')` (`moveDocItems`), which is atomic and checks scope, no cycles, the 3-level limit (counting what's inside a moved folder) and sibling names; `dragDrop.ts` mirrors those rules (`dropBlocker`) to decide which targets light up. Don't change the selection or the layout inside `dragstart` (it cancels the drag; the styling is applied a tick later). HTML5 drag and drop doesn't work on touch screens, so "Move to…" stays.
  - Delete folders with `deleteFolder()`, which deletes the docs inside first so their Storage images go too; subfolders cascade.
- **Diagram editor** (`features/diagrams/editor/`, page body `features/diagrams/components/DiagramView.tsx`, lazy-loaded by `routes/DiagramPage.tsx`):
  - `model.ts` is the saved format: node types `shape`/`icon`/`container`, edge type `connector`. `serialize()` saves only content (no selection or measurements), and `parse()` validates stored JSON. Colors are stored as keys (`colors.ts` maps them to Tailwind classes, so diagrams work in both themes). Icon keys in `icons.ts` are saved, so never rename one.
  - Layers: React Flow runs with `zIndexMode="manual"`. Containers sit below connectors, and connectors below shapes. `normalizeOrder()` keeps parents before children and sets the z-indexes, so call it after any reorder or reparent.
  - Undo is snapshot-based (`useHistory`). Call `snapshot()` *before* every change.
- **Messaging** (`features/messaging/`, route `/t/:teamSlug/messages`, `routes/team/MessagesPage.tsx`; the conversation view is lazy-loaded because it holds TipTap):
  - Team-scoped. Membership is the only authority for DMs and groups (team admins can't read them); channels are readable by the whole team. Every write is re-checked by RLS or an RPC.
  - Queries are **per conversation, never per message** (`conversationReactionsQuery`, `…AttachmentsQuery`, `…RepliesQuery`; the UI groups rows by message). A per-message `useSuspenseQuery` suspends when a new message mounts and flashes the whole page. Keep `ConversationView` on `useQuery` (no Suspense) for the same reason.
  - Messages are the newest `limit` rows (`messagesQuery(id, limit)`); "Load earlier" raises the limit, so a refetch never leaves a gap. Keys: `conversationKeys` (`['messaging', …]`); invalidate by prefix.
  - Sending is optimistic (`useSendMessage`): a `pending-<clientId>` row shows greyed until the server has it, and `client_id` makes a retry idempotent. Edit and delete go through `edit_message`/`delete_message` RPCs (authors only); deleted messages stay as a placeholder.
  - Bodies are TipTap JSON in a constrained schema (`editor.ts`: bold/italic/code, lists, code blocks, http/https/mailto links). `MessageBody` draws only whitelisted nodes. Mentions are `@Name` text plus explicit `mentionIds` for people still in the text.
  - Unread: `conversation_unread_counts(team)` RPC + `conversation_reads` (`mark_conversation_read`, only while the tab is visible and the reader is at the bottom, and only when the cached count says something is unread: every write is echoed to all open tabs as a refetch, so `ConversationView` skips the ones that change nothing, including clearing notifications when the bell has none for the conversation). `useUnread()` feeds the list badges and the sidebar badge; muted conversations (`conversation_preferences`) stay out of the sidebar total.
  - Realtime: `message_attachments` and `message_pins` are in the publication; keep the `AFFECTS` entries in sync with the keys above. Typing uses `useOthersTyping('messages:<id>')`.
  - Notifications live in the header bell (`NotificationBell`, next to the theme toggle), not in the messages sidebar: unread `notifications` for the current group, "Mark all read", and a click marks one read and opens the conversation at the message (a reply notification opens its thread's first message). Reading a conversation also clears its notifications (`markConversationNotificationsRead`). Conversation names load only when the panel opens (`useConversationTitles`).
  - Look: Slack-style rows in DevDock's tone (hairlines, `text-brand` only as an accent). The list is sectioned (Channels / Direct messages / Groups; a DM shows the other person's avatar); consecutive messages by one person within 5 minutes share a name and avatar (`GROUP_WINDOW_MS`), days are split by a date divider, reactions are pills (the picker is a popover), and the per-message actions are a hover/focus toolbar (always visible on touch). The composer is one bordered box with the formatting toolbar inside; its toolbar state comes from `useEditorState` (TipTap doesn't re-render React on every transaction). On a phone the list collapses to a scrolling strip and the whole view is viewport-height.
  - Threads: one level, each with the same rich composer (`MessageComposer`, `draftId` = `thread:<id>`). Per-thread unread comes from `thread_reads` + `mark_thread_read` / `thread_unread_counts` (you take part if you wrote the original or a reply, or opened it); opening a thread, or a reply arriving while it's open, marks it read.
  - Links: the open conversation and a message to scroll to live in the URL (`?c=<conversation>&m=<message>`, `messagePermalink()`); `ConversationView` widens its window until the message is loaded (up to 1000), outlines it briefly, then `MessagesPage` drops `m`. Search results use the same mechanism (a reply result opens its parent).
  - Access: a team member who is removed loses DMs and groups too (`can_read_conversation`/`can_read_message` require team membership). `send_message` has one overload (with `p_mention_ids`); `add_group_member` uses `v_`-prefixed variables because a variable named like a column made it fail.
  - Bodies are only checked to be JSON objects on the server, so `MessageBody` must tolerate anything (null children, odd marks, deep nesting).
  - Not built yet: instant calls from a conversation (the `jaas-token` function only mints tokens for `live_sessions`; a conversation-scoped room needs its own audience rule and an Edge Function change). `public.messages` still has a column UPDATE grant from the first migration; revoke it (`revoke update on public.messages from authenticated` and drop the "Authors can edit messages" policy) in a later migration once every open client uses `edit_message`/`delete_message`.
- **Meetings** (the UI name for live sessions; code, routes `…/live`, table and query keys still say live):
  - **Repeating meetings:** `recurrence.ts` expands a rule (daily / weekdays / weekends / weekly days / specific dates; ends after N or on a date; max 60) into start times in the browser. `rpc('create_live_series')` inserts them as ordinary `live_sessions` rows sharing `series_id`, so each can be edited or cancelled alone. Cancelling offers "also the later meetings" (`deleteLiveSeriesFrom`).
  - **Google Calendar for a series:** one recurring event (`RDATE` list) whose id is stored on every row (`sync_series` op, `setSeriesCalendarEventId`). Never PATCH that event with a single meeting's times; use `sync_series`. Cancelling a single meeting doesn't touch Google until "Update invites".
  - **Calendar files (.ics):** `ics.ts` writes RFC 5545 events the meeting page downloads (`Download .ics`, whole series or one meeting). It needs no account, keys or verification, and opens in Outlook/Teams, Google and Apple Calendar. A series is **one VEVENT per meeting** (not RDATE): each occurrence is its own editable meeting, and clients disagree about whether an RDATE-only event includes its DTSTART. Times are UTC, so no VTIMEZONE is needed; UIDs are `<meeting id>@devdock`, so re-adding updates rather than duplicates. Keep the CRLF line endings, the 75-octet folding and the TEXT escaping if you touch it.
  - **Add to calendar links** (`googleCalendarUrl`/`outlookCalendarUrl` in `ics.ts`): plain pre-filled URLs that open Google Calendar or Outlook for the person to save. No account connection, API or consent prompt — the opposite end from `calendar.ts`, which edits the organizer's calendar and emails invites. The Google link carries a whole series when `inferRecurrence()` can describe it as an RRULE (consecutive days, or the same weekdays each week, all at the same time); hand-picked dates and edited occurrences return null and fall back to the .ics. Outlook's URL takes no rule, so it is always one meeting.
  - **Meeting page wording:** the two routes are deliberately split as **My calendar** (links + .ics: adds it for you alone, no permission) and **Invites** (the sync: creates the event once and emails everyone, writers only, with a `?` tooltip saying it re-sends). They were previously both called "calendar" and nobody could tell them apart.
  - **Invite replies** (`live_session_rsvps`, `RsvpList`): each person's Google RSVP, shown on the meeting page like Teams. Google reports attendees by **email**; `rpc('set_live_session_rsvps')` resolves them to profile ids and stores only those, so no address is ever written to a readable table (the rule `live_session_invitees` follows). Clients have no write grants on the table. Replies are captured from the event after any sync, and refreshed once per visit by `useRefreshRsvps` — organizers only, never on a timer, and the figures are stamped "as of" because the organizer's Google token lasts about an hour. The embed rides on the single-meeting query (`SESSION_COLUMNS`), so the page makes no extra request and list queries stay lean.
  - **Calendar view:** `MeetingsView` switches List / Calendar (`?view=calendar&mode=week&date=`); `MeetingCalendar` (lazy) has month and week grids, click a day or time slot to schedule there.
- **Live sessions** (`features/live/`, routes `…/live` (`TeamLivePage`/`WorkspaceLivePage`) and `…/live/:sessionId` (`LiveSessionPage`, `liveSessionLoader`)):
  - Same scope model as docs, with docs' writer rules for every write (writers = group owners/admins and workspace leads; everyone in the audience reads and joins). `room_name` is never sent to the browser.
  - The embedded call (`JitsiRoom`, lazy) only mounts after `fetchJaasToken()` returns a token from the `jaas-token` Edge Function, which re-checks access and the moderator flag (`public.can_moderate_live_session`) and enforces the join window (15 min before → 1 h after). `time.ts` mirrors that window for the UI.
  - The call outlives the page (`LiveCallProvider` + `CallDock`, one Jitsi iframe at the app shell): docked on the session page, floating bottom-right elsewhere. The floating window can be **hidden** into a small pill (`minimized` in the call context) that shows the title with Show / Return / Leave; the iframe stays mounted (just `invisible` + `inert`), so audio and the connection carry on. Starting a call, ending it, or opening the session page resets it to visible.
  - Google Calendar sync (`calendar.ts`) uses the organizer's Google token (`features/auth/google-calendar.ts`, sessionStorage, ~55 min). With no token, the change is queued and the organizer goes through OAuth once (`connectGoogleCalendar`, `calendar.events` scope); `useCalendarQueue()` finishes it on return. Events are created/patched/deleted with `sendUpdates=all`; `live_sessions.calendar_event_id` links the two.
  - Query keys `['live', …]`; invalidate the `['live']` prefix after any write. `useCanWriteLive` mirrors docs write access (UI only).
- **Leaving or deleting** the current team or workspace: navigate away *first*, then invalidate (see `useExitTeam`). Otherwise the page crashes when its data disappears, or `/app` bounces back through the stale cache.
- **Deploys and open tabs:** a tab opened before a deploy can't load the new build's lazy chunks. `lib/stale-build.ts` reloads once (`vite:preloadError`, plus `RouteErrorPage` as a fallback), guarded against loops. Route errors never show raw error text.
- Avoid `Date.now()` in render (oxlint `react/purity`); capture it with `useState(Date.now)`.

### UI

- shadcn/ui uses the `radix-nova` style (`components.json`); add components with `npx shadcn@latest add <name>`. Class merging uses `cn()` from `@/lib/utils`, which re-exports shadcn's official `cn` package.
- Theme: `.dark` class on `<html>`, set by `ThemeProvider` (localStorage key `devdock-theme`) and by an inline script in `index.html` that prevents a theme flash on load. Use the semantic color tokens (`bg-background`, `text-muted-foreground`, …), never raw grays.
- **Visual tone:** a modern developer tool, as dense as Linear and as readable as Notion. Content aligns left next to the sidebar (max ~1200px), not in a centered column. Prefer lists, typography and hairline separators over cards; use `PageHeader`, `SettingsSection`/`DangerRow` and `PersonRow`. **DevDock blue is an accent only** (`text-brand`/`bg-brand`: active tab underline, active nav icon, lead/owner labels, focus ring). Geist Sans, with Geist Mono for codes, numbers and times.
- **Brand:** the product is **DevDock**. Show the logo only through `LogoMark` / `LogoWordmark` in `src/components/Logo.tsx`; `LogoWordmark` switches to the light-text version in dark mode. Don't hand-edit files in `src/assets/brand/` or the favicons in `public/`; they're generated from `brand/source/` by `brand/build.py` (see `brand/README.md`).
- `.oxlintrc.json` turns off two rules for generated shadcn files only. Don't widen that override to app code.

## Supabase

- **Client:** `src/lib/supabase.ts` exports `supabase = createClient<Database>(…)`. It throws on import if env vars are missing or if the key is a secret/service-role key. Only import it from `api.ts`-style data modules, never from components.
- **Keys:** the frontend uses the **publishable** key (`sb_publishable_…`) only. **Frontend code must never contain a secret key (`sb_secret_…`), a legacy `service_role` key, or a DB password**, whether in source, in `VITE_` vars, or in comments/tests. Anything needing elevated privileges belongs in the database (RLS, `security definer` functions) or, later, a server-side function.
- **Schema changes go through migrations only.** Never create or alter tables, policies, functions, or triggers in the dashboard. Create them with `supabase migration new <snake_case_name>` and put the SQL in `supabase/migrations/`. Migrations are append-only: once applied anywhere, fix forward with a new migration and never edit the old file.
- **RLS is mandatory.** Every table in `public` enables RLS in the migration that creates it, with explicit policies per operation, scoped `to authenticated` (or narrower). No `using (true)` without a written justification in the migration. Use `(select auth.uid())` (evaluated once per statement), not bare `auth.uid()`.
- **Grants:** Supabase grants broad table privileges to `anon`/`authenticated` by default. Migrations revoke them and grant only what's needed (see the `profiles` migration: `select` plus column-level `update`).
- **Functions:** set `search_path = ''` and schema-qualify everything. Use `security definer` only when required (e.g. triggers on `auth.users`), and revoke `execute` from `public, anon, authenticated` unless the function is meant to be called over the API.
- **`updated_at`:** attach the shared `public.set_updated_at()` trigger to any table with that column.
- **Profiles:** created by the `on_auth_user_created` trigger (security definer, tolerant of missing OAuth metadata), not by app code. Clients can read/update only their own row, and only `display_name`/`avatar_url`.
- **Types:** `src/types/database.types.ts` is CLI-generated from the linked project. After each migration: `supabase db push`, then `npm run db:types`, then commit both. Never hand-write or hand-edit table types, and don't use `any` to get around missing types. Generated `Insert`/`Update` types ignore column grants, so the DB may still reject a write the types allow.

## Authentication

- **Supabase Auth with Google** for everyone, plus **one email + password admin account** the owner asked for so the app can be opened without a Google round trip (testing, automated request counts): `/admin-login` (`AdminLoginPage`, `signInWithPassword`, linked from nowhere). The account is created in the Supabase dashboard (Authentication → Users), never in code, and its password is never committed. It has no special powers: what it sees comes from its group and workspace roles under RLS, so make it an admin of the group it should test. There is no sign-up or reset in the app. Enabling the Email provider means anyone can try passwords against the project's auth API, whatever the page URL; the owner accepted that. No magic links or other providers unless asked. PKCE flow (`flowType: 'pkce'` in `src/lib/supabase.ts`); `redirectTo` is always `window.location.origin + '/auth/callback'`, never a hardcoded host.
- **All auth calls live in `src/features/auth/api.ts`.** Components use the hooks in `features/auth/hooks.ts` (`useAuth`, `useCurrentProfile`, `useUserIdentity`, `useSignInWithGoogle`, `useSignOut`) and never import `supabase` directly.
- **Route protection happens in loaders, not components.** Any new authenticated route goes *under* the `app` route, whose loader (`src/layouts/app-loader.ts`) calls `requireUser(request)` before anything else. Child loaders that need the user call `requireUser` again (it's cheap; loaders run in parallel). Don't add `useEffect`-style redirect guards.
- **Post-login destination:** `/login?next=` (validated by `safeNextPath`: same-site paths only). It's stored in sessionStorage across the Google round trip so the callback URL stays fixed.
- **Identity changes** (sign-in/out in another tab, expired session) are handled once, in `watchAuthIdentity` (router.tsx): clear the query cache, then `router.revalidate()`. Never call Supabase APIs inside an `onAuthStateChange` callback (deadlock risk; defer with `setTimeout`).
- **Profiles are created only by the DB trigger.** Don't add client-side profile inserts. If a profile is missing or fails to load, the UI falls back to Google metadata (`useUserIdentity`).
- **Route guards are UX, not security.** Every data rule must be enforced by RLS. Don't pass user IDs from the client as proof of anything.
- **Errors:** show friendly messages (`features/auth/errors.ts`), log the raw error with `console.error('[auth] …')`, and never render Supabase/Postgres error text.
- **Adding a deployed environment:** add `<origin>/auth/callback` to Supabase → Authentication → URL Configuration → Redirect URLs, and the origin to Google's Authorized JavaScript origins. The Google client secret lives only in the Supabase dashboard.

## Environment & secrets

- Env vars live in `.env.local` (git-ignored). `.env.example` lists variable names only (no values) and is committed. Declare new `VITE_` vars in `src/env.d.ts` too.
- Current vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optional `VITE_GITHUB_APP_SLUG` (public; hides Connect GitHub when unset). Live/JaaS keys (`JAAS_APP_ID`, `JAAS_KEY_ID`, `JAAS_PRIVATE_KEY`) and GitHub App keys (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` as PKCS#8, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`) are **Edge Function secrets**, set with `supabase secrets set`, never `VITE_` vars.
- Only `VITE_`-prefixed vars reach the browser, and **everything in the bundle is public**. Never put a service-role/secret key or any other secret in a `VITE_` var or in client code.
- Security must come from Supabase RLS policies, not client-side checks.

## Tooling notes

- Local Node is 20; `@supabase/supabase-js` ≥ 2.110 requires Node 22, so it's pinned at `^2.109.0` (the lockfile holds 2.109.0). Upgrade Node to 22 LTS before bumping it.

## Git

- Default branch: `prod`. Work on feature branches; don't commit directly to `prod` unless asked.
