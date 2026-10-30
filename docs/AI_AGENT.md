# Calsko AI (code: Ask DevDock, the `ai-agent` Edge Function)

A person types what they want ("assign CAP-12 to Sree"); a language model picks among a few **tools**, and each tool does the
work through the same tables, RPCs and Edge Functions the UI uses, **with the caller's token**, so RLS, grants and triggers decide.
The model is an interface, never the backend. No tool uses the service role; the prompt holds no permission rules.

## Flow and layout

Panel (`src/features/ai`, lazy) → `ai-agent`: `auth.getUser(token)` (the only source of the user id) → `agent/context.ts`
(group and open page re-read under RLS) → `agent/runner.ts` (≤ 6 model rounds) → answer, confirmation card or error.
Folders: `agent/` (no provider, no feature), `providers/` (`gemini.ts` behind `AiProvider`), `tools/` (`registry.ts` + one file
per feature, registered in `tools/index.ts`), `safety/confirmation.ts`, `tests/`. Chat history lives in the browser (50 turns,
last 12 sent); `ai_requests` keeps one private row per request (text, tool calls, reply) for tracing; `/privacy` says so.

## Adding a tool

1. Build the feature normally (tables, RLS, RPCs, UI).
2. Write `tools/<feature>.ts` with `defineTool({ name, description, inputSchema, domain, capability, risk, execute })`.
   `execute` calls the same path the UI calls via `context.db` or `context.callFunction`; return `ok()`/`fail()`.
3. Add it to `tools/index.ts`. The runner never changes.
4. Test it in `tests/tools.test.ts` (local stack only). If it reads new kinds of data, update `/privacy`.

Rules: never take the user's id as an argument (`context.userId`); take human references (`CAP-12`, a project name) and return
candidates (`AMBIGUOUS`) instead of guessing; return small results (≤ 12,000 chars, no TipTap JSON); narrow tools only (no
`run_sql`); constants copied from the app get a drift test.

## Risk and confirmation

`read` runs; `write` runs when clearly asked; `external` (reaches another person, e.g. `send_message`) and `destructive` are
**always confirmed**: `prepare` checks, the arguments wait in `ai_pending_actions` (service role only, 10 min, claimed once),
and the person confirms on a card. Cancelling a note is a `write` (reversible), not destructive.

## Limits and secrets
2,000 chars per request, 6 rounds, 4 tool calls per round, 15 s per tool, 50 s per request, 20 requests/min per person.
Logs carry ids, tool names and timings, never text or tokens. Secrets: `GEMINI_API_KEY`, optional `GEMINI_MODEL`,
`GEMINI_BASE_URL`, `AI_PROVIDER`, `AI_ENABLED` (`false` = off for everyone). Per group: the `ask_devdock` feature flag.

## Kept UI behaviour

- Moving an issue into In Progress also calls the `github` function's `create_branch`, as `useUpdateIssue` does.
- Note times: the model passes `inMinutes`, a local `date`/`time`, or `meetingId` + `minutesBefore`, never a timestamp; the server
  converts with `zonedInstant` (DST-safe). A day without a time is asked about; placeholder titles ("reminder") are refused.
- Message and description text becomes the same TipTap JSON the browser writes. `send_message`'s `client_id` is the pending id.

## Tools
`find_user`, `search_issues`, `get_issue`, `create_issue`, `update_issue`, `find_conversation`, `send_message` (confirmed),
`get_upcoming_meetings`, `get_meeting` (never `room_name`), `create_reminder`, `list_reminders`, `update_reminder`,
`complete_reminder`, `cancel_reminder`. They don't delete anything, read docs or message history, or create labels/sprints/channels.
Tests: `npm run test:ai` (no database) and `sh supabase/functions/ai-agent/tests/run-local.sh` (local stack only).
