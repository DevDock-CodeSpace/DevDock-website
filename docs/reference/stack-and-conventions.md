# Stack, commands, conventions and UI: the full wording

CLAUDE.md has the short version of these rules; this is the original, complete text (moved 2026-10-28).

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
| Diagrams           | React Flow (`@xyflow/react`, MIT) | Own UI in DevDock's style (not an embed); stored as JSON in `diagrams.data`. Lazy-loaded with the diagram page. `perfect-freehand` (MIT, pinned) draws pen strokes, in the same lazy chunk. `@dagrejs/dagre` (MIT, pinned) lays out Mermaid imports and loads only when one runs |
| Live sessions      | Jitsi Meet via JaaS (8x8) — `@jitsi/react-sdk` embed | Room token minted server-side by the `jaas-token` Edge Function (RS256, `jose`); domain is `8x8.vc`, config from JaaS secrets. Lazy-loaded with the session page |
| Code               | GitHub App + `repos`            | Group repos linked to projects. A GitHub App connects them (the `github` Edge Function); webhooks and branches come in 9c–9e |
| Hosting            | Vercel                          | Static SPA; `vercel.json` rewrites every path except `/assets/*` to `index.html` (so a missing chunk is a real 404, not HTML) |
| Backend deploys    | GitHub Actions (`deploy-supabase.yml`) | Vercel deploys only the SPA. A push that changes `supabase/migrations/`, `supabase/functions/` or `config.toml` runs `supabase db push`, then deploys every Edge Function: `dev` → DevDock Dev, `prod` → live. Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` (live), `SUPABASE_DEV_DB_PASSWORD` (dev). Function *secrets* (`supabase secrets set`) are still set by hand |

## Commands

```bash
npm install
npm run dev         # Vite dev server against the DevDock Dev project (.env.devdb over .env)
npm run dev:live    # Vite dev server against the live project (.env): only when you really need live
npm run typecheck   # tsc -b (app + node configs)
npm run lint        # oxlint
npm run build       # typecheck + production build to dist/
npm run perf        # after a build: fails if the first load got heavier (budgets: scripts/check-performance.mjs)
npm run check       # everything below in one go: lint, typecheck + build, perf (CI runs this on every PR)
npm run preview     # serve dist/
npm run test:ai     # Deno tests for the ai-agent Edge Function (needs Deno; database tests: see docs/AI_AGENT.md)
npm run test:idle   # Deno tests for the inactivity sign-out clock (src/lib/inactivity.ts)
npm run test:reminders  # Deno tests for reminder time labels and the time field's parsing (reminders/when.ts, live/timeOfDay.ts)
npm run test:ninety     # Deno tests for the Ninety sync's rules (supabase/functions/ninety-sync/plan.ts)
npm run test:mermaid    # Deno tests for the diagram editor's Mermaid import (finding, parsing, layout without overlaps)
npm run test:import     # Deno tests for importing issues (CSV reading, column and value guesses, parents before sub-issues)
npm run db:types    # regenerate src/types/database.types.ts from the linked project (Supabase CLI)
npm run seed:dev    # fill an empty DevDock Dev project with test data (scripts/seed-dev.mjs; keychain secrets)
```

Supabase CLI (DB work only; the app doesn't need it): `supabase migration new <name>`, `supabase db push [--dry-run]`, `supabase migration list`.

**Two Supabase projects** (since 2026-10-24, `docs/DEV_ENVIRONMENT.md`): **DevDock Dev** (`aktqcsncvbmkbleghipb`, seeded test data only) and the **live** project (`ejqrrxxiatvvdiyxtvid`, real people). Build and test against dev: push a new migration there first with `supabase db push --db-url <dev pooler URL>` (the repo stays *linked* to live, so a bare `supabase db push` hits live), run the app with `npm run dev`, and run browser tests as `dev-admin@devdock.test`. The workflow deploys migrations and functions to dev on a push to `dev` and to live on a push to `prod`. Pushing to live by hand still needs a backup and the owner's OK. Never copy live data into dev. `supabase start` / `db reset` need Docker; nothing else does.

**Request counts** are tested from a separate private repo, `DevDock-CodeSpace/DevDock-request-tests` (two signed-in browser sessions against the live site, a budget per action). `.github/workflows/request-check.yml` starts its quick set after every push to `prod`, the full suite runs weekly, and a summary is emailed. When a change is meant to alter how many requests an action makes, update that repo's `budgets.json`.

Before calling a task done, run `npm run check` (lint, typecheck + build, then the performance budget). It must pass; GitHub Actions (`.github/workflows/ci.yml`) runs the same command on every pull request to `dev` and `prod`.

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

- Avoid `Date.now()` in render (oxlint `react/purity`); capture it with `useState(Date.now)`.

### UI

- shadcn/ui uses the `radix-nova` style (`components.json`); add components with `npx shadcn@latest add <name>`. Class merging uses `cn()` from `@/lib/utils`, which re-exports shadcn's official `cn` package.
- Theme: `.dark` class on `<html>`, set by `ThemeProvider` (localStorage key `devdock-theme`) and by an inline script in `index.html` that prevents a theme flash on load. Use the semantic color tokens (`bg-background`, `text-muted-foreground`, …), never raw grays.
- **Visual tone:** a modern developer tool, as dense as Linear and as readable as Notion. Content fills the width next to the sidebar (no max width, the owner's choice), not a centered column. Prefer lists, typography and hairline separators over cards; use `PageHeader`, `SettingsSection`/`DangerRow` and `PersonRow`. **DevDock blue is an accent only** (`text-brand`/`bg-brand`: active tab underline, active nav icon, lead/owner labels, focus ring). Geist Sans, with Geist Mono for codes, numbers and times.
- **No backdrop blur** (owner's choice, 2026-10-26): panels, dialogs and the header bar are solid or plainly shaded (`bg-black/25` behind overlays). `backdrop-blur` repaints everything behind it, and the header's did so on every scroll; don't add it back.
- **Lazy screens use `preloadable()`** (`lib/preloadable.ts`; each feature's `screens.ts`): the route loader starts the code with the data, or a hover does for a panel or tab, and a preloaded component renders without suspending (plain `lazy()` suspends anyway and React then holds the reveal ~300 ms). Lazy panels (Notes, Ask DevDock) are also mounted closed on hover, so the click only opens them. See the performance skill for the numbers.
- **Loading:** waits of a page or more (the full-screen `AuthLoading`, joining a call, opening a conversation, the Mermaid importer) show `DockSpinner` (`components/DockSpinner.tsx`), and so does a navigation whose loader takes over 150 ms (`NavigationSpinner`): a breathing blue arc around the logo's three dots, animated in SVG (SMIL, no CSS keyframes), still under reduced motion. Buttons and short inline waits keep lucide's `LoaderCircle`; page content keeps its skeletons.
- **Brand:** the product is **DevDock**. Show the logo only through `LogoMark` / `LogoWordmark` in `src/components/Logo.tsx`; `LogoWordmark` switches to the light-text version in dark mode. The logo is SVG (version 2, October 2026; the old one is kept in `brand/v1/`). `Logo.tsx` imports the SVGs straight from `brand/`; don't hand-edit the favicons in `public/`, `brand/build.sh` renders them (see `brand/README.md`).
- `.oxlintrc.json` turns off two rules for generated shadcn files only. Don't widen that override to app code.

## Environment & secrets

- Env vars live in `.env.local` (git-ignored). `.env.example` lists variable names only (no values) and is committed. Declare new `VITE_` vars in `src/env.d.ts` too.
- Current vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optional `VITE_GITHUB_APP_SLUG` (public; hides Connect GitHub when unset) and `VITE_INACTIVITY_LIMIT_MINUTES` (minutes before the inactivity sign-out; 15 when unset). Live/JaaS keys (`JAAS_APP_ID`, `JAAS_KEY_ID`, `JAAS_PRIVATE_KEY`) and GitHub App keys (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` as PKCS#8, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`) are **Edge Function secrets**, set with `supabase secrets set`, never `VITE_` vars.
- Only `VITE_`-prefixed vars reach the browser, and **everything in the bundle is public**. Never put a service-role/secret key or any other secret in a `VITE_` var or in client code.
- Security must come from Supabase RLS policies, not client-side checks.

## Tooling notes

- Local Node is 20; `@supabase/supabase-js` ≥ 2.110 requires Node 22, so it's pinned at `^2.109.0` (the lockfile holds 2.109.0). Upgrade Node to 22 LTS before bumping it.

## Git

- Default branch: `prod`. Work on feature branches; don't commit directly to `prod` unless asked.
