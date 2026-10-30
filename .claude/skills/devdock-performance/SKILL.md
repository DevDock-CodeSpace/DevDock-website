---
name: devdock-performance
description: Keep the app (Calsko, formerly DevDock) fast. Use before and while writing any code that fetches data, adds or changes a route, query, list, realtime subscription, dependency, editor or large component, or anything that could add requests, JavaScript weight or render cost. Holds the speed rules, the budgets, the pre-flight questions, and when to stop and ask the owner before slowing the app down.
---

# Performance rules

The app feels instant for deliberate reasons: no app server in the request path (browser → Supabase, RLS decides), cache first
(TanStack Query, Realtime invalidates narrow prefixes, nothing polls), requests start together, optimistic edits, small split
JavaScript, small data filtered in the browser, few requests per action (every request is a log line on Supabase's Free plan).

## Pre-flight questions

1. Which requests does this add, on which screen, and are they independent (then parallel)?
2. Does it add to the **first load** (JS or CSS)? 3. Does its cost grow with the data (rows, messages, members)?
4. Does navigation or first paint wait on something slow? 5. Does it poll, or work on every render, scroll or keystroke?
6. Does it add a shell query, or a write the user didn't ask for (each write is echoed to every open tab as a refetch)?

## Rules

- **No waterfalls:** a page's loader starts everything it reads on first render (`Promise.all` of `prefetchQuery`); read
  independent queries with `useSuspenseQueries`, never several `useSuspenseQuery` in a row. Real dependencies: one batch each.
- **No N+1:** fetch per scope, group in the browser (`conversationReactionsQuery` is the model).
- Don't suspend a stable screen on a re-query: `useQuery` + `placeholderData: keepPreviousData` (see `ConversationView`).
- Select only used columns; index every new `where`/`order by` column. Never write on every refetch.
- Keys under existing prefixes; a new table needs an `AFFECTS` entry and a publication migration. Invalidate narrowly.
- Shell data that rarely changes uses `SETTLED_STALE_MS` (10 min). Don't refetch on tab return what Realtime delivers
  (`lib/live.ts`; unpublished tables under a live root go in `NOT_LIVE`).
- **Autosave** costs exactly one request in the saving tab and none elsewhere: `ownSave(table, id)` before, its result with the
  returned `updated_at` after, update the cache yourself, invalidate lists only for changes they show.
- Don't write when nothing would change: check the cache first (read positions, notifications).
- **Bundle:** anything over ~20 KB gz not needed for the first screen is lazy, via `preloadable()` (never bare `lazy()`): start
  the code in the loader beside the data, or on hover for panels. Import single icons.
- `npm run check` must pass: first-load JS ≤ 345 KB gz, CSS ≤ 30 KB gz, editors/diagram/video/highlighter not in the first load.
- **Rendering:** lists that can pass ~200 rows page or virtualize; no per-row queries or timers; `useMemo` for derived data on
  keystrokes or events; keep editor `onUpdate` cheap; don't change layout inside `dragstart`.

## Stop and ask the owner first

If a change would add a request to every page's shell or first paint; add more than ~10 KB gz to the first load or a dependency
over ~20 KB gz, or need a budget raised; make a screen wait on more than two sequential round trips; fetch unbounded data;
poll or work on every render/scroll/keystroke; or make navigation wait on slow data. Say what gets slower (with numbers), the
cheaper options (lazy, parallel prefetch, paginate, load on open, cache) and your recommendation.

## Done means

`npm run check` passes. For data changes, count requests on the screen cold and warm ("first visit: N requests in M rounds"),
and for writes or realtime, in the acting tab and in a second tab. Measure real traffic in Supabase → Logs → API Gateway.
Known gaps: some pages still read queries in a row (`WorkspaceGitHubPage`, `TeamReposSection`, `LearningProgressPage`).
Accepted trade-off (2026-10-18): Meetings lists page from the server, 10 per request.
