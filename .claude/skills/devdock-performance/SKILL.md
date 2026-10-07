---
name: devdock-performance
description: Keep DevDock fast. Use before and while writing any code that fetches data, adds or changes a route, query, list, realtime subscription, dependency, editor or large component, or anything that could add requests, JavaScript weight or render cost. Holds the speed rules, the budgets, the pre-flight questions, and when to stop and ask the owner before slowing the app down.
---

# DevDock performance rules

DevDock feels instant for specific, deliberate reasons. Every change must keep them true. If a change
would make the app slower, **stop and ask the owner before building it** (see "Stop and ask").

## Why the app is fast (don't break these)

1. **No app server in the request path.** The browser talks straight to Supabase; permissions live in RLS.
   The page code is static files on a CDN (no SSR, no cold starts). Edge Functions are only for rare actions.
2. **Cache first.** TanStack Query (`staleTime` 60 s). Revisiting a page shows cached data. Realtime events
   *invalidate* narrow query prefixes; nothing polls.
3. **Requests start together.** Route loaders prefetch what a page needs in parallel
   (`issuesLoader` is the model); independent reads in a component are batched with `useSuspenseQueries`.
4. **Instant feedback.** Edits and sends are optimistic (rollback + toast on failure).
5. **Small, split JavaScript.** First load is about 320 KB gzipped. Editors (TipTap), diagrams (React Flow),
   video (Jitsi) and code highlighting are separate chunks loaded only when opened.
6. **Small data, filtered in the browser.** One query per scope; tabs, filters and grouping make no requests.

## Pre-flight: answer these before writing the code

1. Which requests does this add, on which screen, and are they independent? (independent means parallel)
2. Does it add anything to the **first load** (JS or CSS)?
3. Does the cost grow with the amount of data (rows, messages, members)?
4. Does it make navigation or first paint wait on something slow?
5. Does it poll, use timers, or do work on every render, scroll or keystroke?

## Rules

**Fetching**
- **No waterfalls.** Never read independent queries with several `useSuspenseQuery` calls in a row: each one
  waits for the one before. Use `useSuspenseQueries`, and put the page's queries in a route loader with
  `queryClient.prefetchQuery` inside `Promise.all` (loaders only block on what the page needs first). A query
  that truly needs another's result (an issue's comments need the issue's id) is a real dependency: keep the
  dependent step to one parallel batch.
- **No N+1.** Never a request per row, message or item. Fetch for the whole scope and group in the browser
  (`conversationReactionsQuery` is the model; the per-message version fired ~150 requests per page).
- **Don't suspend a stable screen on a re-query.** Use `useQuery` with `placeholderData: keepPreviousData`
  (see `ConversationView`) so a refetch or a changed key doesn't blank the page.
- Select only the columns you use. Every new `where`/`order by` column gets an index in the migration.
- Don't run a write on every refetch (we once called `ensure_general_channel` on each message event).
- Keep query keys under the existing prefixes so Realtime `AFFECTS` invalidates them; a new table needs an
  `AFFECTS` entry and a publication migration. Invalidate narrow prefixes, not `['issues']`.
- Optimistic update for anything the user expects to feel instant (edits, sends, toggles).

**Bundle**
- Anything over about 20 KB gzipped that isn't needed to paint the first screen is lazy-loaded
  (`lazy()` or its own route). Import single icons, never whole libraries.
- `npm run build && npm run perf` must pass: first-load JS <= 345 KB gz, CSS <= 30 KB gz, and the editors,
  diagram, video and highlighter must not appear in the first load. The script prints the numbers.
- New dependencies need the owner's OK (CLAUDE.md); check their cost with the build before proposing one.

**Rendering**
- Lists that can pass about 200 rows: paginate or virtualize. No per-row queries, subscriptions or timers.
- Derived data that is recomputed on every keystroke or realtime event goes in `useMemo`.
- Keep editor `onUpdate` handlers cheap (set state only when the value changes).
- Don't change layout or the dragged element inside `dragstart` (it cancels the drag); defer that styling.

## Stop and ask

Before implementing, **stop and ask the owner** (AskUserQuestion) if the feature would:

- add a request to every page's shell or first paint (`AppLayout`, sidebar, header, a loader on all routes);
- add more than about 10 KB gzipped to the first load, add a dependency over about 20 KB gzipped, or need a budget raised;
- make a screen wait on more than two sequential round trips, or add a waterfall that can't be flattened;
- fetch unbounded data for a list that can grow (no limit or pagination);
- add polling, intervals, or work on every render, scroll or keystroke;
- make navigation wait on slow data.

Say what gets slower (numbers when you can get them), the cheaper options (lazy-load, prefetch in parallel,
paginate, load on open, cache), and your recommendation. Build the slower version only if the owner agrees,
and add it to "Accepted trade-offs" below.

## Done means

- `npm run typecheck && npm run lint && npm run build && npm run perf` all pass.
- For data changes, count the requests on the affected screen on a cold and a warm visit. Say it in the PR
  ("first visit: N requests in M rounds"). A new screen with two or more queries gets a test that holds every
  request open and asserts they all started before any finished (see `parallel.test.tsx` in the PR that added
  this guide for the pattern: `deferred` promises in the fake client).

## Known gaps (fix when you touch them)

Components that read several independent queries in a row (verify, then batch or prefetch): `WorkspaceGitHubPage`,
`MessagesPage`, `TeamReposSection`, `TeamWorkspacesPage`, `TeamDocsPage` and `WorkspaceDocsPage`
(docs + folders), `LearningProgressPage`, `AddWorkspaceMembersDialog`, and the hooks in `features/teams`,
`features/learning` and `features/docs`.

Scale limits (the app is sized for single-digit users): the Issues pages load every issue of a workspace in
one query. Revisit (server-side filtering and paging) before a workspace passes about 500 issues.

## Accepted trade-offs

(None yet. Add a line with the date and the owner's decision whenever something slower is approved.)
