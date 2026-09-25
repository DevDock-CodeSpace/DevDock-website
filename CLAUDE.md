# DevDock

DevDock is a private software-engineering teaching workspace for **one instructor and a small group of students** (single digits). It is not a public product. Optimize for clarity, low maintenance, and low hosting cost over scale.

## Current status

**Phase 1 done: frontend shell.** React Router, Tailwind v4, shadcn/ui, and TanStack Query are installed. The app has a responsive sidebar layout, light/dark/system theme, and placeholder pages driven by mock data (replaced by real data in Phase 4). TipTap, draw.io, and Jitsi are not installed yet. **Add each piece only when a task needs it**, and don't build ahead.

**Phase 2 done: Supabase foundation.** `@supabase/supabase-js`, a typed browser client (`src/lib/supabase.ts`), the `supabase/` CLI project, and the first migration (`profiles` + RLS + a sign-up trigger), **applied to the hosted project** (ref `ejqrrxxiatvvdiyxtvid`, linked via `supabase link`).

**Phase 3 done: Google sign-in** via Supabase Auth (PKCE). All app routes require a session, and the sidebar shows the signed-in user's profile. Sign-in verified end-to-end with a real Google account. The app now **requires** the Supabase env vars.

**Phase 4 (in progress): Team → Workspace model is real.** A **team** (owner/admin/member; type learning/development/general) contains **workspaces** (lead/member; type course/project/general). Invite codes join a team, and workspace access is assigned separately. The UI has onboarding (create a team or join with a code), a team switcher, and real workspace, member, invite and settings pages. The mock data is gone. Lessons, Live Session and Resources are placeholder pages (no tables yet); Lessons shows only for course workspaces. Current status and next steps: `docs/STATUS.md`.

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
| Rich text / notes  | TipTap                          | |
| Diagrams           | diagrams.net / draw.io (embed)  | Store diagram XML, not just images |
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
  features/<name>/   # feature-scoped components, types, api.ts, hooks (auth/, teams/, workspaces/)
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
  - Public: `/login`, `/auth/callback`.
  - Authenticated (under route id `app`):
    - `/app` redirects to the last-used team, or to `/onboarding` when the user has none.
    - `/onboarding`
    - `/t/:teamSlug` (the team's workspaces), plus `members` and `settings`.
    - `/t/:teamSlug/w/:workspaceId` (overview), plus `members` and `settings`; every other feature tab is `:tab`, checked against the workspace type in `WorkspaceTabPage`.
  - `/` redirects to `/app`.
- **Access checks in loaders** (`features/teams/loaders.ts`): `teamLoader` 404s when the user isn't a team member; `workspaceLoader` 404s when the workspace isn't visible (RLS) or belongs to another team.
- **Current context:** `useCurrentTeam()` and `useCurrentWorkspace()` (`features/teams/hooks.ts`) return the entity, the user's role, and `can`, a permissions object from `features/teams/permissions.ts` that mirrors RLS. **`can` is for showing and hiding UI only.** Every write is re-checked by RLS. Type labels and icons are in `teamTypes` and `workspaceTypes` in the same file.
- **Navigation:** the **sidebar is the hierarchy**: team switcher, Home, the **team tools** (Docs, Diagrams, Live; `TEAM_TOOLS`), the team's workspaces grouped by **workspace** type (Courses, Projects, Workspaces; empty sections hidden; team type only decides which section comes first and the default type for "+ New", via `workspaceTypeOrder`/`defaultWorkspaceType`), one "+ New", team Members and Settings. **Workspace features are horizontal tabs** under the workspace title (`WorkspaceLayout`), **generated from the workspace's enabled tools** (`workspace_modules`; `getWorkspaceTabs(teamSlug, id, modules)` in `features/teams/nav.ts`): Overview, then the tools in `MODULE_ORDER`, then Members. Workspace *type* only picks default tools (`defaultModules`, which mirrors `public.default_workspace_modules`). Create workspaces with `rpc('create_workspace')` and change tools with `rpc('set_workspace_modules')`; both are atomic and run under RLS. Don't put workspace features in the sidebar.
- **Team tools vs workspace tabs:** Docs, Diagrams and Live exist at both levels as views of the same data. Future rows have `team_id` (required) + `workspace_id` (nullable: null = team-wide). The team page (`TeamToolPage`) shows everything the caller can access; the workspace tab shows only that workspace's rows. Issues, Learning, Exercises, GitHub and Resources are workspace-only.
- **Data pattern:** `features/<name>/api.ts` exports `queryOptions` and mutation functions.
  - Loaders prime what the shell needs with `ensureQueryData`. Pages read with `useSuspenseQuery`; `AppLayout` has a Suspense boundary, so pages may also load secondary data that way.
  - Errors go through `lib/errors.ts` (`toDataError`, `requireAffected`), because RLS makes forbidden UPDATE/DELETE return 0 rows, not an error. Show them with `toast.error(errorMessage(e))`.
- **Query keys:** `['teams', …]` and `['workspaces', …]`; invalidate by prefix after mutations.
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
