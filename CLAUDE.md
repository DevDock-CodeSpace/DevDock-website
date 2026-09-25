# DevDock

DevDock is a private software-engineering teaching workspace for **one instructor and a small group of students** (single digits). It is not a public product. Optimize for clarity, low maintenance, and low hosting cost over scale.

## Current status

> **Naming:** the UI calls a team a **group** ("Group settings", "Group-wide", "Create or join a group"). Code, routes (`/t/:teamSlug`), query keys and the database still say **team**. Keep new user-facing text on "group"; don't rename code for it.

**Phase 1 done: frontend shell.** React Router, Tailwind v4, shadcn/ui, and TanStack Query are installed. The app has a responsive sidebar layout, light/dark/system theme, and placeholder pages driven by mock data (replaced by real data in Phase 4). TipTap (Phase 5b) and React Flow (Phase 5c) are installed; Jitsi is not installed yet. **Add each piece only when a task needs it**, and don't build ahead.

**Phase 2 done: Supabase foundation.** `@supabase/supabase-js`, a typed browser client (`src/lib/supabase.ts`), the `supabase/` CLI project, and the first migration (`profiles` + RLS + a sign-up trigger), **applied to the hosted project** (ref `ejqrrxxiatvvdiyxtvid`, linked via `supabase link`).

**Phase 3 done: Google sign-in** via Supabase Auth (PKCE). All app routes require a session, and the sidebar shows the signed-in user's profile. Sign-in verified end-to-end with a real Google account. The app now **requires** the Supabase env vars.

**Phase 4 (in progress): Team → Workspace model is real.** A **team** (owner/admin/member; type learning/development/general) contains **workspaces** (lead/member; type course/project/general). Invite codes join a team, and workspace access is assigned separately. The UI has onboarding (create a team or join with a code), a team switcher, and real workspace, member, invite and settings pages. The mock data is gone.

**Phase 5a done: Docs.** A `documents` table (team-wide or assigned to a workspace) with RLS, Team → Docs and Workspace → Docs lists.

**Phase 5b done: rich docs editor (Dropbox Paper-style).** TipTap v3 (MIT extensions only) with highlight.js via lowlight, stored as TipTap JSON in `documents.body`; images in the private `doc-images` Storage bucket. Autosave.

**Phase 5c done: Diagrams (Lucidchart-style).** A `diagrams` table (same scope and RLS rules as `documents`) holding React Flow JSON, with Team → Diagrams and Workspace → Diagrams lists and an in-app editor styled like DevDock: a shape/icon library, containers, connectors, a properties panel, undo/redo, copy/paste, alignment guides, autosave. 

**Phase 6a done: Issues (Linear-style), part 1.** Workspace-only issues with IDs like `CAP-12` (per-workspace `issue_key` + counter). Each issue has a status workflow, priority, assignee, labels, estimate, due date and sub-issues. Views are a List grouped by status and a Board with drag-and-drop; the issue page has a rich description (the Docs editor, without images), sub-issues, comments and a properties panel. Any workspace member can create and edit issues. Leads and team owners/admins delete issues and manage labels and the key. 

**Phase 6b done: Issues, part 2.**
- **Cycles:** Linear's sprints, numbered per workspace and never overlapping; managers create, edit and delete them, and there's a "move open issues to the next cycle" action.
- **Views:** All / Active / Backlog / My issues tabs, and filters (status, priority, assignee, labels, cycle) kept in the URL.
- **Activity log:** written by DB triggers and shown with comments as an Activity feed.
- **Keyboard shortcuts:** Linear-style; press `?` for the list.

Live, Learning and the other tools are still placeholder pages. Current status and next steps: `docs/STATUS.md`.

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
| Live sessions      | Jitsi Meet (embed)              | |
| Code               | GitHub links                    | Link to repos/PRs; no GitHub API integration unless asked |
| Hosting            | Vercel                          | Static SPA; `vercel.json` rewrites all paths to `index.html` |

## Commands

```bash
npm install
npm run dev         # Vite dev server
npm run typecheck   # tsc -b (app + node configs)
npm run lint        # oxlint
npm run build       # typecheck + production build to dist/
npm run preview     # serve dist/
npm run db:types    # regenerate src/types/database.types.ts from the linked project (Supabase CLI)
```

Supabase CLI (DB work only; the app doesn't need it): `supabase migration new <name>`, `supabase db push [--dry-run]`, `supabase migration list`. `supabase start` / `db reset` need Docker; nothing else does.

Before calling a task done, run `npm run typecheck`, `npm run lint`, and `npm run build`. All three must pass.

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
  features/<name>/   # feature-scoped components, types, api.ts, hooks (auth/, teams/, workspaces/, docs/, diagrams/, issues/)
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
  - Public: `/login`, `/auth/callback`, `/privacy` (privacy policy for Google's consent screen; keep it matching what the app stores).
  - Authenticated (under route id `app`):
    - `/app` redirects to the last-used team, or to `/onboarding` when the user has none.
    - `/onboarding`
    - `/t/:teamSlug` (the team's workspaces), plus `members` and `settings`.
    - `/t/:teamSlug/w/:workspaceId` (overview), plus `members` and `settings`; every other feature tab is `:tab`, checked against the workspace type in `WorkspaceTabPage`.
  - `/` redirects to `/app`.
- **Access checks in loaders** (`features/teams/loaders.ts`): `teamLoader` 404s when the user isn't a team member; `workspaceLoader` 404s when the workspace isn't visible (RLS) or belongs to another team.
- **Current context:** `useCurrentTeam()` and `useCurrentWorkspace()` (`features/teams/hooks.ts`) return the entity, the user's role, and `can`, a permissions object from `features/teams/permissions.ts` that mirrors RLS. **`can` is for showing and hiding UI only.** Every write is re-checked by RLS. Type labels and icons are in `teamTypes` and `workspaceTypes` in the same file.
- **Navigation:** the **sidebar is the hierarchy**: team switcher, Home, the **team tools** (Docs, Diagrams, Live; `TEAM_TOOLS`), the team's workspaces grouped by **workspace** type (Courses, Projects, Workspaces; empty sections hidden; team type only decides which section comes first and the default type for "+ New", via `workspaceTypeOrder`/`defaultWorkspaceType`), one "+ New", team Members and Settings. **Workspace features are horizontal tabs** under the workspace title (`WorkspaceLayout`), **generated from the workspace's enabled tools** (`workspace_modules`; `getWorkspaceTabs(teamSlug, id, modules)` in `features/teams/nav.ts`): Overview, then the tools in `MODULE_ORDER`, then Members. Workspace *type* only picks default tools (`defaultModules`, which mirrors `public.default_workspace_modules`). Create workspaces with `rpc('create_workspace')` and change tools with `rpc('set_workspace_modules')`; both are atomic and run under RLS. Don't put workspace features in the sidebar.
- **Team tools vs workspace tabs:** Docs, Diagrams and Live exist at both levels as views of the same data. Rows have `team_id` (required) + `workspace_id` (nullable: null = team-wide; composite FK `(workspace_id, team_id) → workspaces(id, team_id)` keeps it in the same team). The team page shows everything the caller can access; the workspace tab shows only that workspace's rows. Docs and Diagrams are built this way (`documents`/`diagrams`, `Team…Page`/`Workspace…Page`, one `DocPage`/`DiagramPage` for both routes, `docLoader`/`diagramLoader`); Live still uses the placeholder `TeamToolPage`. The "New …" dialog is the shared `CreateInScopeDialog`. Built workspace tools sit under `WorkspaceToolGate`, which 404s when the tool is off. Issues, Learning, Exercises, GitHub and Resources are workspace-only.
- **Issues** (`features/issues/`, routes `…/w/:id/issues` (`?view=board`) and `…/issues/:issueNumber`, `issueLoader`):
  - Rows are addressed by **number within the workspace**, not UUID. The identifier is `issueIdentifier(workspace.issue_key, number)`.
  - `number`, `team_id` and `created_by` are set by DB triggers (`private.issue_counters`). The assignee-is-a-member, same-workspace-parent and no-loop rules are enforced by the `check_issue` trigger.
  - Labels on an issue are replaced with `rpc('set_issue_labels')`.
  - Field edits go through `useUpdateIssue()` (optimistic, rolls back with a toast). Pickers use the searchable `Picker` popover.
  - `useIssueContext().canManage` mirrors `private.can_manage_workspace` (UI only).
  - Cycles live under `…/issues/cycles[/:cycleNumber]` (`cycleLoader`). Numbering and the no-overlap rule are enforced by the `prepare_issue_cycle` trigger; `rpc('move_open_issues')` rolls open issues over.
  - `issue_activity` is written only by triggers (`log_issue_activity`, `log_issue_label_activity`); clients can only read it. Don't add client-side activity writes.
  - Views are URL state: `?tab=`, filter facets (`readFilters`/`writeFilters`, `useIssueFilters`), `?view=board`.
  - Shortcuts use `useShortcuts` (ignored while typing or while a menu/dialog is open). Lists get J/K focus and per-row menus through `IssueCollection` + `IssueNavContext`.
- **Data pattern:** `features/<name>/api.ts` exports `queryOptions` and mutation functions.
  - Loaders prime what the shell needs with `ensureQueryData`. Pages read with `useSuspenseQuery`; `AppLayout` has a Suspense boundary, so pages may also load secondary data that way.
  - Errors go through `lib/errors.ts` (`toDataError`, `requireAffected`), because RLS makes forbidden UPDATE/DELETE return 0 rows, not an error. Show them with `toast.error(errorMessage(e))`.
- **Query keys:** `['teams', …]`, `['workspaces', …]`, `['documents', …]`, `['diagrams', …]` and `['issues', …]` (built by `issueKeys`); invalidate by prefix after mutations.
- **Docs editor** (`features/docs/editor/`, page body `features/docs/components/DocView.tsx`, lazy-loaded by `routes/DocPage.tsx`):
  - Extensions are listed in `extensions.ts`, and the typography lives in `styles.ts` as Tailwind classes (no global CSS).
  - `documents.body` (TipTap JSON) is the source of truth; `content` is a plain-text copy written with it.
  - Images are the custom `docImage` node, which stores a Storage **path** (`<team>/<doc>/<uuid>.<ext>`), never a URL; the view signs it (`docImageUrlQuery`). Upload with `uploadDocImage`. `deleteDocument` removes the doc's image folder first.
  - Collapsed headings are per-viewer plugin state (`CollapsibleHeadings.ts`), never saved.
  - Don't add paid TipTap extensions.
- **Diagram editor** (`features/diagrams/editor/`, page body `features/diagrams/components/DiagramView.tsx`, lazy-loaded by `routes/DiagramPage.tsx`):
  - `model.ts` is the saved format: node types `shape`/`icon`/`container`, edge type `connector`. `serialize()` saves only content (no selection or measurements), and `parse()` validates stored JSON. Colors are stored as keys (`colors.ts` maps them to Tailwind classes, so diagrams work in both themes). Icon keys in `icons.ts` are saved, so never rename one.
  - Layers: React Flow runs with `zIndexMode="manual"`. Containers sit below connectors, and connectors below shapes. `normalizeOrder()` keeps parents before children and sets the z-indexes, so call it after any reorder or reparent.
  - Undo is snapshot-based (`useHistory`). Call `snapshot()` *before* every change.
- **Leaving or deleting** the current team or workspace: navigate away *first*, then invalidate (see `useExitTeam`). Otherwise the page crashes when its data disappears, or `/app` bounces back through the stale cache.
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

- **Supabase Auth with Google only** (no email/password, magic links or other providers unless asked). PKCE flow (`flowType: 'pkce'` in `src/lib/supabase.ts`); `redirectTo` is always `window.location.origin + '/auth/callback'`, never a hardcoded host.
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
- Current vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_JITSI_DOMAIN`.
- Only `VITE_`-prefixed vars reach the browser, and **everything in the bundle is public**. Never put a service-role/secret key or any other secret in a `VITE_` var or in client code.
- Security must come from Supabase RLS policies, not client-side checks.

## Tooling notes

- Local Node is 20; `@supabase/supabase-js` ≥ 2.110 requires Node 22, so it's pinned at `^2.109.0` (the lockfile holds 2.109.0). Upgrade Node to 22 LTS before bumping it.

## Git

- Default branch: `prod`. Work on feature branches; don't commit directly to `prod` unless asked.
