# DevDock

DevDock is a workspace for small teams that learn and build software together: chat, files (docs and whiteboards), issues and plans, meetings, courses, notes, an AI assistant, GitHub, and EOS (Ninety) for one customer. Optimize for clarity, low maintenance and low hosting cost over scale.

This file holds the rules. **Before touching a feature, read its file in `docs/reference/`** (index at the end). What was built and when is in `docs/HISTORY.md`.

## Names: the UI and the code differ

Keep new user-facing text on the UI word; don't rename code for it.

| UI says | Code, routes, tables, query keys say |
|---|---|
| Group ("Group settings", "Group-wide") | team (`/t/:teamSlug`, `teams`) |
| Sprint | cycle (`…/issues/cycles`, `?cycle=`, `issue_cycles`) |
| Whiteboard (icon `Presentation`) | diagram (`…/diagrams/:id`, `?view=diagrams`, `diagrams`) |
| Chat (single items stay "messages") | messaging / messages (`…/messages`, `features/messaging/`) |
| Files (docs and whiteboards on one page, `FILES_TAB`) | docs (`…/docs`; `…/diagrams` redirects via `DiagramsRedirect`) |
| Notes | reminders (`features/reminders/`, `reminders`) |
| Meetings | live / live sessions (`…/live`, `live_sessions`) |
| EOS ("Ninety" only where it means the Ninety app) | ninety (`…/ninety`, `features/ninety/`, `ninety-sync`, `ninety_sync` flag) |
| IDS (on the EOS page) | Ninety Issues (`ninety_issue_links`) |
| Space (workspace type) | `general` |

## Stack

React 19 + TypeScript (strict), Vite (SPA), React Router 7 (data mode), Tailwind v4, shadcn/ui (`radix-nova`), TanStack Query, Supabase (Postgres, Auth, Storage, Realtime, Edge Functions, pg_cron, Vault; RLS is the authorization layer). TipTap v3 for rich text (MIT extensions only, lazy), React Flow for whiteboards (lazy; `perfect-freehand`, `@dagrejs/dagre` pinned), Jitsi via JaaS for calls (lazy; token from the `jaas-token` function), a GitHub App (`github`, `github-webhook` functions), Gemini for Ask DevDock (`ai-agent`). Hosting: Vercel (static; `vercel.json` rewrites every path except `/assets/*` to `index.html`).

**Deploys:** Vercel deploys the SPA. GitHub Actions (`deploy-supabase.yml`) runs `supabase db push` and deploys every Edge Function when `supabase/migrations/`, `supabase/functions/` or `config.toml` change: a push to `dev` → DevDock Dev, to `prod` → live. Function secrets (`supabase secrets set`) are set by hand.

Keep dependencies lean. **Ask before adding a library outside this stack.**

## Commands

```bash
npm run dev         # Vite against DevDock Dev (.env.devdb over .env)
npm run dev:live    # against the live project: only when you really need live
npm run check       # lint + typecheck + build + performance budget. Must pass before calling anything done (CI runs it on every PR)
npm run typecheck | lint | build | perf | preview
npm run test:ai | test:idle | test:reminders | test:ninety | test:mermaid | test:import   # Deno tests (see each feature's reference)
npm run db:types    # regenerate src/types/database.types.ts (never hand-edit it)
npm run seed:dev    # fill an empty DevDock Dev with test data
```

SQL access tests live in `supabase/tests/*.sql` (each rolls back). Run them against DevDock Dev or a local stack, **never live**, after touching the rules they cover.

## Environments

- **Two Supabase projects** (`docs/DEV_ENVIRONMENT.md`): **DevDock Dev** (`aktqcsncvbmkbleghipb`, test data only) and **live** (`ejqrrxxiatvvdiyxtvid`, real people). Build and test against Dev. The repo stays *linked to live*: push a migration to Dev with `supabase db push --db-url <dev pooler URL>`; a bare `supabase db push` hits live.
- **Pushing to live by hand needs a backup and the owner's OK.** Never copy live data into Dev.
- **Browser tests:** sign in at `/admin-login` as `dev-admin@devdock.test` (group owner) or `dev-member@devdock.test`; passwords are in the macOS keychain ("DevDock Dev admin" / "DevDock Dev member"). Never print secrets into a command line or a log.
- **Request counts** are tested from the private repo `DevDock-CodeSpace/DevDock-request-tests` after each push to `prod`; update its `budgets.json` when a change is meant to alter how many requests an action makes.

## Performance (read before coding)

The app is fast on purpose. **Before writing code that fetches data, adds a route, list, query, dependency or editor, read `.claude/skills/devdock-performance/SKILL.md`** and follow it: no request waterfalls, no N+1, lazy-load anything heavy, stay within the first-load budget (about 341 of 345 KB gzipped: almost no room). **If a feature would slow things down** (a request on every page, more than ~10 KB on the first load, sequential round trips, unbounded lists, polling, a job that runs all day), **stop and ask the owner first**, with the cheaper options.

Watch the build when adding a route, a loader or a dynamic import: Rollup can regroup shared code and add ~1 KB to everyone's first load (it happened three times on 2026-10-28; see `docs/reference/eos.md`). Compare `npm run perf` before and after, with the `.env` files present (without them the build drops most of the Supabase client and measures low).

## Conventions

- **TypeScript is strict** (`noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`). `import type` for types. No `any`; use `unknown` and narrow.
- **Imports** use the `@/` alias for `src/` (kept in sync in `vite.config.ts` and `tsconfig.app.json`).
- **Lint** with oxlint (`.oxlintrc.json`). The override for generated shadcn files stays limited to them.
- **Components:** PascalCase `.tsx`, one exported component per file, named exports (default only where a lazy route needs it).
- **Styling:** Tailwind classes; no new global CSS beyond the base layer in `src/index.css`. Semantic tokens (`bg-background`, `text-muted-foreground`), never raw grays.
- Avoid `Date.now()` in render (oxlint `react/purity`): `useState(Date.now)`.

```
src/
  main.tsx, router.tsx   # providers; all routes (createBrowserRouter, data mode)
  layouts/               # AppLayout (group shell), app-loader.ts (auth guard)
  routes/                # pages: team/* (/t/:teamSlug), workspace/* (…/w/:workspaceId), admin/*
  features/<name>/       # api.ts, hooks, components, loaders per feature
  components/ui/         # shadcn/ui generated (npx shadcn@latest add <name>)
  components/, hooks/, lib/, types/
supabase/migrations/     # the schema's source of truth
supabase/functions/      # Edge Functions
supabase/tests/          # SQL access tests
```

## Data rules (details: `docs/reference/data-and-live-updates.md`)

- **Components never call Supabase.** Each feature's `api.ts` exports `queryOptions` and mutation functions; components use them through TanStack Query.
- **Loaders start what a page needs**, in parallel (`ensureQueryData` for what the shell awaits, `prefetchQuery` for the rest). Shell data starts in `appLoader` / `teamLoader`, never in a mounted component. Pages read with `useSuspenseQuery` / `useSuspenseQueries`.
- **Errors** go through `lib/errors.ts` (`toDataError`, `requireAffected`: RLS turns a forbidden UPDATE/DELETE into 0 rows, not an error) and are shown with `toast.error(errorMessage(e))`. Never show raw Supabase or Postgres text.
- **Query keys** live under feature prefixes (`['teams', …]`, `['workspaces', …]`, `['issues', …]`, …); invalidate the narrowest prefix that changed.
- **Live updates:** a new table needs an entry in `AFFECTS` (`lib/realtime.ts`) **and** a migration adding it to the `supabase_realtime` publication, or must be listed in `NOT_LIVE` (`lib/live.ts`). Editors save with `ownSave` and keep a `synced` copy (see the reference).
- **Group-level lists** read the collection in view with `useCollectionView()`, not `teamWorkspacesQuery` (`docs/reference/structure-and-navigation.md`).
- **Leaving or deleting** the open group or workspace: navigate away first, then invalidate (`useExitTeam`).
- **Lazy screens use `preloadable()`** (`lib/preloadable.ts`), started by the route's loader or on hover, never bare `lazy()`.

## Supabase rules

- **Client:** `src/lib/supabase.ts` (`createClient<Database>`). It refuses to load without env vars or with a secret key. Import it only from `api.ts`-style modules.
- **Keys:** the browser uses the **publishable** key only. **Never put a secret key, service-role key or DB password in frontend code, a `VITE_` var, a comment or a test.** Anything privileged belongs in the database (RLS, `security definer`) or an Edge Function.
- **Schema changes go through migrations only** (`supabase migration new <name>`), never the dashboard. **Migrations are append-only**: once applied anywhere (Dev included), fix forward with a new one.
- **RLS is mandatory** on every `public` table, with explicit per-operation policies `to authenticated` (or narrower). No `using (true)` without a written reason. Use `(select auth.uid())`.
- **Grants:** revoke Supabase's default table privileges and grant only what's needed (column-level where it matters).
- **Functions:** `set search_path = ''`, schema-qualify everything, `security definer` only when needed, and revoke `execute` from `public, anon, authenticated` unless the API should call it. A policy may only call functions the caller can execute.
- **Supabase's API refuses UPDATE/DELETE without a WHERE** (pg-safeupdate), also inside functions called through it: keep a WHERE even on one-row tables.
- **Workspace access** is decided in one place, `private.workspace_role()` / `can_view_workspace`; ask about another person with `private.has_workspace_access()`, never by reading `workspace_members`.
- **`updated_at`:** attach `public.set_updated_at()`.
- **Profiles** are created only by the `on_auth_user_created` trigger.
- **Types:** after a migration, regenerate `src/types/database.types.ts` and commit both. Generated `Insert`/`Update` types ignore column grants.

## Auth rules (details: `docs/reference/auth-and-sessions.md`)

- Google sign-in for everyone (PKCE, `redirectTo` always `window.location.origin + '/auth/callback'`), plus password accounts at `/admin-login` created only in the Supabase dashboard. `super@admin.com` is the **platform admin**: in no group, console at `/admin`.
- **All auth calls live in `features/auth/api.ts`**; components use its hooks.
- **Route protection happens in loaders** (`requireUser`), under the `app` route. No `useEffect` redirect guards. **Guards are UX; RLS is the security.** Never pass a user id from the client as proof.
- Identity changes are handled once, in `watchAuthIdentity`. Never call Supabase inside an `onAuthStateChange` callback.
- Sessions live per tab unless "Remember me" (4 h / 12 h), and 15 minutes without input signs the browser out. A new way to sign in must start both clocks.
- Friendly auth errors (`features/auth/errors.ts`); log raw ones with `console.error('[auth] …')`.

## UI rules

- **Tone:** a modern developer tool, as dense as Linear and as readable as Notion. Content fills the width beside the sidebar (no max width). Lists, typography and hairlines over cards; use `PageHeader`, `SettingsSection` / `DangerRow`, `PersonRow`.
- **DevDock blue is an accent only** (`text-brand` / `bg-brand`: active tab, active nav icon, lead/owner labels, focus ring). Geist Sans; Geist Mono for codes, numbers and times.
- **No backdrop blur** (it repainted the page on every scroll).
- **Loading:** `DockSpinner` for page-sized waits, lucide `LoaderCircle` in buttons, skeletons for page content.
- **Logo** only through `LogoMark` / `LogoWordmark` (`components/Logo.tsx`); favicons are rendered by `brand/build.sh`.
- Theme: `.dark` on `<html>` (`ThemeProvider`, key `devdock-theme`, inline script in `index.html`).
- Explanations belong where they're needed (empty states, a "How it works" popover), not in permanent banners (owner, 2026-10-28).

## Environment and secrets

- Env vars live in `.env.local` (git-ignored); `.env.example` lists names only. Declare new `VITE_` vars in `src/env.d.ts`.
- Browser vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, optional `VITE_GITHUB_APP_SLUG`, `VITE_INACTIVITY_LIMIT_MINUTES`. **Everything in the bundle is public.**
- Edge Function secrets (`supabase secrets set`, never `VITE_`): JaaS (`JAAS_APP_ID`, `JAAS_KEY_ID`, `JAAS_PRIVATE_KEY`), GitHub App (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` as PKCS#8, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`), AI (`GEMINI_API_KEY`, optional `GEMINI_MODEL`, `GEMINI_BASE_URL`, `AI_PROVIDER`, `AI_ENABLED`). Ninety tokens are per group, in Vault.

## Tooling and git

- Local Node is 20, so `@supabase/supabase-js` is pinned at `^2.109.0`; upgrade Node to 22 before bumping it.
- Default branch `prod`. Work on feature branches (PRs to `dev`, then `dev` → `prod`); don't commit to `prod` unless asked.

## Where things are explained

| Before touching… | Read |
|---|---|
| routes, the sidebar, workspaces, access settings, collections, page layout | `docs/reference/structure-and-navigation.md` (+ `docs/HIERARCHY_PLAN.md`) |
| loaders, query keys, Realtime, autosave, editors' sync | `docs/reference/data-and-live-updates.md` |
| issues, sprints, views, pins, Plans, the Issues hub, import | `docs/reference/issues.md` (+ `docs/ISSUES_HUB_PLAN.md`) |
| repos, branches, PR webhooks | `docs/reference/github.md` |
| docs, whiteboards, folders, sharing, link chips | `docs/reference/files.md` |
| courses and lessons | `docs/reference/learning.md` |
| Chat | `docs/reference/messaging.md` (+ `docs/MESSAGING_ARCHITECTURE.md`) |
| Notes | `docs/reference/notes.md` (+ `docs/REMINDERS.md`) |
| meetings, calls, calendars | `docs/reference/meetings.md` |
| Ask DevDock | `docs/reference/ai.md` (+ `docs/AI_AGENT.md`) |
| `/admin`, feature flags | `docs/reference/platform-admin-and-flags.md` |
| EOS / Ninety | `docs/reference/eos.md` (+ `docs/NINETY.md`) |
| sign-in, sessions, inactivity | `docs/reference/auth-and-sessions.md` |
| the dev project, seeding, keys | `docs/DEV_ENVIRONMENT.md` |
| the full original wording of the rules above | `docs/reference/stack-and-conventions.md`, `docs/reference/supabase.md`, `docs/reference/auth-and-sessions.md` |
| what exists and when it was built | `docs/HISTORY.md` |
