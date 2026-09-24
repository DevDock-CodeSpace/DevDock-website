# DevDoc

DevDoc is a private software-engineering teaching workspace for **one instructor and a small group of students** (single digits). It is not a public product. Optimize for clarity, low maintenance, and low hosting cost over scale.

> Repo folder is named `DevDock-website`; the product name is **DevDoc**.

## Current status

**Phase 1 done: frontend shell.** React Router, Tailwind v4, shadcn/ui, and TanStack Query are installed. The app has a responsive sidebar layout, light/dark/system theme, and placeholder pages driven by **mock data** (`src/features/courses/mock-data.ts`). TipTap, draw.io, Jitsi, and Supabase are not installed yet. **Add each piece only when a task needs it**, and don't build ahead.

Explicitly **not yet**: authentication, Supabase integration.

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
```

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
  layouts/           # AppLayout: sidebar + header + <Outlet/>
  routes/            # page components; routes/course/* for /courses/:courseId/*
  features/<name>/   # feature-scoped components, types, api.ts, hooks
  components/ui/     # shadcn/ui generated components (don't hand-edit much)
  components/        # shared app components (AppSidebar, PageHeader, Theme*)
  hooks/             # shared hooks
  lib/               # queryClient, utils
```

### Routing & data

- Routes: `/app` (workspace home), `/courses/:courseId` (overview) plus `lessons`, `live`, `resources`, `members`, `settings`. `/` redirects to `/app`.
- Course sidebar items are defined once in `src/features/courses/nav.ts`; the sidebar and breadcrumb both read it.
- Data pattern: `features/<name>/api.ts` exports `queryOptions`. The layout route's `loader` primes the cache with `queryClient.ensureQueryData`, and components read with `useSuspenseQuery` (e.g. `useCurrentCourse()`). To move to Supabase, replace the fetcher bodies in `api.ts` and keep the query keys.
- Avoid `Date.now()` in render (oxlint `react/purity`); capture it with `useState(Date.now)`.

### UI

- shadcn/ui uses the `radix-nova` style (`components.json`); add components with `npx shadcn@latest add <name>`. Class merging uses `cn()` from `@/lib/utils`, which re-exports shadcn's official `cn` package.
- Theme: `.dark` class on `<html>`, set by `ThemeProvider` (localStorage key `devdoc-theme`) and by an inline script in `index.html` that prevents a theme flash on load. Use the semantic color tokens (`bg-background`, `text-muted-foreground`, …), never raw grays.
- Visual tone: developer workspace. Neutral palette, Geist Sans, and Geist Mono (`font-mono`) for codes, numbers, handles, and times.
- `.oxlintrc.json` turns off two rules for generated shadcn files only. Don't widen that override to app code.

## Environment & secrets

- Env vars live in `.env.local` (git-ignored). `.env.example` lists the expected keys.
- Only `VITE_`-prefixed vars reach the browser, and **everything in the bundle is public**. Never put a Supabase service-role key or any other secret in a `VITE_` var or in client code.
- Security must come from Supabase RLS policies, not client-side checks.

## Git

- Default branch: `prod`. Work on feature branches; don't commit directly to `prod` unless asked.
