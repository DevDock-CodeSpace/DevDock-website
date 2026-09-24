# DevDoc

DevDoc is a private software-engineering teaching workspace for **one instructor and a small group of students** (single digits). It is not a public product. Optimize for clarity, low maintenance, and low hosting cost over scale.

> Repo folder is named `DevDock-website`; the product name is **DevDoc**.

## Current status

Bootstrapped only: React + TypeScript + Vite with a placeholder `App.tsx`. None of the stack below beyond React/TS/Vite is installed yet. **Add each piece only when a task needs it**, and don't build ahead.

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
| Hosting            | Vercel                          | Static SPA; needs a rewrite to `index.html` for client routes |

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
- **Styling:** Tailwind utility classes once installed. No new global CSS beyond the base layer.
- Keep dependencies lean. Ask before adding libraries outside the target stack.

### Planned layout (create folders as needed, not up front)

```
src/
  main.tsx, App.tsx
  routes/            # route components / layouts
  features/<name>/   # feature-scoped components, hooks, api.ts
  components/ui/     # shadcn/ui generated components
  components/        # shared app components
  lib/               # clients (supabase, queryClient), utils
  types/             # shared types (incl. generated Supabase types)
```

## Environment & secrets

- Env vars live in `.env.local` (git-ignored). `.env.example` lists the expected keys.
- Only `VITE_`-prefixed vars reach the browser, and **everything in the bundle is public**. Never put a Supabase service-role key or any other secret in a `VITE_` var or in client code.
- Security must come from Supabase RLS policies, not client-side checks.

## Git

- Default branch: `prod`. Work on feature branches; don't commit directly to `prod` unless asked.
