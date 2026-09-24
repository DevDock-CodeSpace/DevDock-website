# DevDoc: project status

_Last updated: 2026-09-24 (Phase 3)_

A handoff for anyone (human or AI) planning the next phase. For conventions, see [CLAUDE.md](../CLAUDE.md); for setup, see [README.md](../README.md).

## What DevDoc is

A private software-engineering teaching workspace for one instructor and a few students. It's not a public product: optimize for clarity, low maintenance and low hosting cost. Repo folder `DevDock-website`, product name **DevDoc**. Default branch `prod`.

**Stack:** React 19 + TypeScript (strict) + Vite, React Router 7 (data mode), Tailwind v4, shadcn/ui, TanStack Query, and Supabase (Postgres, Auth, RLS). Planned: TipTap, draw.io, Jitsi Meet, GitHub links, Vercel hosting.

## Phases

| Phase | Status | Branch / commit |
|---|---|---|
| 0: Project setup | ✅ Done | `prod` |
| 1: Frontend shell (mock data) | ✅ Done | `prod` |
| 2: Supabase foundation | ✅ Done (migration applied to hosted project) | `feat/supabase-foundation` (`7eb5801`) |
| 3: Google authentication | ✅ Done: sign-in verified with a real Google account | `feat/google-auth` |
| 4: Courses, members, lessons in the DB | ⏳ Not started | |

### Phase 1: frontend shell
- Collapsible sidebar (slide-out panel on mobile) with Overview, Lessons, Live Class, Resources, Members and Settings; a breadcrumb header; and a light/dark/system theme.
- Routes: `/app` plus `/courses/:courseId`, `…/lessons`, `…/live`, `…/resources`, `…/members` and `…/settings`, with a 404 page and an unknown-course error page.
- Mock course "Software Engineering Fundamentals" (SEF-101) with 8 lessons (01 Computer Basics … 08 APIs), in `src/features/courses/mock-data.ts`.
- Data pattern: `features/<name>/api.ts` exports `queryOptions`; the layout loader primes the cache; pages read with `useSuspenseQuery`.

### Phase 2: Supabase foundation
- Typed browser client `src/lib/supabase.ts`, which uses the publishable key only and refuses secret or service-role keys.
- Migration `20260924214141_create_profiles.sql`, **applied** to project `ejqrrxxiatvvdiyxtvid`:
  - `profiles` table and a `set_updated_at()` trigger.
  - RLS on, with two policies: read own row, update own row.
  - Narrowed grants: `anon` gets nothing; `authenticated` can SELECT and can UPDATE only `display_name` and `avatar_url`.
  - `on_auth_user_created` trigger that creates the profile from OAuth metadata.
- `src/types/database.types.ts` is generated from the live project (`npm run db:types`).

### Phase 3: Google authentication
- **Flow:** Supabase Auth with Google, PKCE. `/login` → Google → Supabase → `/auth/callback` → the originally requested page.
- **Route protection:** in the authenticated layout's loader (`requireUser`), before render. Unauthenticated users go to `/login?next=…`, and signed-in users visiting `/login` go on to `next` or `/app`.
- **Session:** persisted by supabase-js in localStorage and auto-refreshed. An `onAuthStateChange` watcher clears the query cache and re-runs the guards when the identity changes, including sign-out in another tab.
- **Sidebar user menu:** the real name, avatar and email (from `profiles`, falling back to Google metadata), and **Sign out**.
- **Verified with a real Google account:**
  - Sign-in succeeded.
  - The trigger created exactly one `profiles` row, with display name and avatar filled.
  - RLS and both policies are unchanged.
- **Verified by automated browser tests (32 checks):**
  - Redirects for logged-out users, including `next` preservation and open-redirect protection.
  - Callback error handling (cancelled, provider error, missing code).
  - A readable message when Google is disabled.
  - With a simulated session: refresh persistence, sign-out, cross-tab sign-out, and the profile-failure fallback.
  - Unknown routes still return the 404 page.
  - The request to Google carries the correct `redirect_uri`, PKCE `code_challenge` and scopes.
- **No database migration was needed.**

## Current configuration (hosted)
- **Supabase URL Configuration:** Site URL `http://localhost:5173`; Redirect URLs `http://localhost:5173/**`.
- **Supabase Google provider:** enabled. Client ID and secret are set in the dashboard only; nonce checks are on; users without an email are not allowed.
- **Google OAuth client:** web application. JS origin `http://localhost:5173`; redirect URI `https://ejqrrxxiatvvdiyxtvid.supabase.co/auth/v1/callback`.
- **Local env:** `.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` and is git-ignored.

## Not done yet
- **Phase 4:** tables for courses, course members (roles: instructor/student), invitations, lessons, resources and live sessions, all with RLS. Then replace the mock fetchers in `src/features/courses/api.ts` (keep the query keys).
- **Profile visibility between course members:** needs a new, narrowly scoped `profiles` SELECT policy (e.g. "users who share a course"). Today it's own-row only.
- **Later:** TipTap, draw.io, Jitsi, Storage, Vercel deployment.

## Open items and decisions for Phase 4
- **Who may use DevDoc:** right now any Google account can sign in (while the Google app is in *Testing* mode, only listed test users). Phase 4 should decide how access is granted, for example invitations or an allow-list checked by RLS. Signed-in users currently can't see anything beyond mock content and their own profile.
- **Deployment:** before going to Vercel, add the production origin to Supabase Redirect URLs and Site URL, and to Google's JS origins. Set the two `VITE_` env vars in Vercel.
- **Tooling:**
  - Local Node is 20 (end-of-life); `@supabase/supabase-js` is pinned to `^2.109.0` because 2.110 and later need Node 22.
  - The JS bundle is about 740 kB (220 kB gzipped) since supabase-js was added, over Vite's 500 kB advisory. Per-page code loading would fix it.
- **Merging:** the Phase 2 and Phase 3 branches haven't been merged to `prod` or pushed.
