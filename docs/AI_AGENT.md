# Ask DevDock (AI agent)

Ask DevDock lets a person type what they want ("assign CAP-12 to Sree", "what meetings do I have today?")
and has a language model choose among a small set of **tools** that do the work through DevDock's existing
tables, RPCs and Edge Functions, as that person, under RLS.

The model is an interface, never the backend. It chooses a tool and its arguments; everything it asks for is
validated and then allowed or refused by the same database rules the UI goes through.

## How a request flows

```text
Ask DevDock panel (src/features/ai, lazy-loaded)
  → ai-agent Edge Function (supabase/functions/ai-agent)
      1. auth.getUser(token)            the only source of the user id
      2. agent/context.ts               group, workspace and open page re-read under the caller's RLS
      3. agent/runner.ts                asks the provider, runs the tools it picks, at most 6 rounds
           providers/gemini.ts          the model (behind the AiProvider interface)
           tools/registry.ts            the tools (definition for the model, executor for the server)
           safety/confirmation.ts       external and destructive tools stop here for a yes
      4. answer, confirmation card, or error
  → existing tables / RPCs / Edge Functions, as the caller
  → Supabase RLS, grants and triggers decide
```

The function keeps two tables: `ai_pending_actions` (confirmations waiting) and `ai_requests` (a record of each request,
below). Chat history lives in the browser tab and the last 12 turns are sent with each request (bounded again on the
server); the chat itself isn't stored, only each request on its own.

**Request record (`ai_requests`, `agent/record.ts`):** the owner asked (2026-10-19) to keep what people type so a wrong
answer can be traced (a reminder came out at the wrong time). One row per message request: the text, open page, time
zone and the clock the model was given, every tool call (name, arguments, success/code, result cut to 2,000
characters) and the reply, including failures. Written with the service role, pinned to the verified user id; a failed
write is logged and never fails the request. RLS: a person reads only their own rows (group admins can't, as with
reminders); no update/delete grants; kept until the person or group is deleted (no purge). `/privacy` says so, keep it
true. Confirm and cancel actions aren't recorded.

| Folder | What it holds | Knows about |
|--------|---------------|-------------|
| `agent/` | types, context, prompt, runner, argument validation, time zones, logging | no provider, no feature |
| `providers/` | `AiProvider` implementations (`gemini.ts`) and the choice between them | the model's API only |
| `tools/` | `registry.ts` and one file per feature | DevDock's tables and RPCs |
| `safety/` | confirmation policy and the pending-action store | nothing feature-specific |
| `tests/` | Deno tests | |

## Adding AI support to a new DevDock feature

1. **Build the feature normally**: tables with RLS, RPCs, the UI. The AI adds no rules of its own.
2. **Write `tools/<feature>.ts`** exporting an array of `defineTool({...})`. For each tool:
   - `name` (snake_case verb_noun), `description` (written for the model: when to use it, what comes back),
     `inputSchema` (the JSON Schema subset in `agent/types.ts`);
   - `domain` (the feature) and `capability` (`search`, `get`, `create`, `update`, `send`, …);
   - `risk`: `read`, `write`, `external` or `destructive`;
   - `execute(args, context)`: call the **same** table, RPC or Edge Function the UI calls, through `context.db`
     (the caller's client) or `context.callFunction`. Return `ok(data)` or `fail(code, message)` from `tools/shared.ts`;
     pass database errors through `dbFailure`.
   - for `external`/`destructive` tools also `prepare(args, context)` (check everything, change nothing, return a
     preview), and optionally `editable` fields and `confirmedMessage`.
3. **Register it**: add the array to `tools/index.ts`. Nothing in `agent/`, `providers/` or `safety/` changes.
4. **Test it** in `tests/tools.test.ts` against the local stack: what it returns, and what each kind of person is refused.
5. **Add its row to the mapping table below**, including any behaviour the UI adds outside the database.
6. If the tool reads a new kind of data, update `/privacy` (what is sent to the model).

Rules for tools:

- **Never take the signed-in user's id as an argument.** Use `context.userId`. Other people are ids from `find_user`.
- **Take human references, resolve them on the server**: `CAP-12`, a project name, a label name. Return candidates
  (`AMBIGUOUS`, `NEEDS_CLARIFICATION`) instead of choosing.
- **Return little**: names and the fields needed to answer, capped lists, no ids the model doesn't need, no TipTap
  JSON (use `docToText` with a limit). The runner refuses results over 12,000 characters.
- **Narrow tools only.** No `run_sql`, no "call any RPC". A test fails on names like these.
- **No service role in tools.** If a tool seems to need it, the rule belongs in the database.
- Constants copied from the app (statuses, priorities) get a line in the drift test (`tests/provider.test.ts`).

## Risk and confirmation

| Risk | Meaning | Policy |
|------|---------|--------|
| `read` | changes nothing | runs |
| `write` | changes DevDock data the person can change in the UI | runs when clearly asked for |
| `external` | reaches another person (a message, later an invite) | **always confirmed** |
| `destructive` | can't be undone (later: delete, cancel) | **always confirmed** |

A `write` tool can opt in with `confirm: true`; nothing can opt out. The policy is `requiresConfirmation()` in
`safety/confirmation.ts` and reads only the tool's metadata.

Confirmed tools never run from the model's call. The runner calls `prepare`, stores the checked arguments in
`ai_pending_actions` (10 minutes) and returns a preview. **Confirm** sends back only the row's id, plus edits to
fields the tool listed as `editable`, which are validated again. The row is claimed with one
`UPDATE … WHERE executed_at IS NULL`, so two confirmations run it once. Browsers have no grants on the table: it is
written through the service role, pinned to the verified user id, and that client is used for nothing else.

## Security model

- The user id comes from `auth.getUser()` on the request's token. A `userId` in the body is ignored.
- Every tool query runs with the caller's token. RLS, column grants and triggers (`check_issue`, `send_message`'s
  membership check) are the authority; the prompt contains no permission rules.
- The model sees: the system prompt, the person's name, group, open page and time, the tool definitions, the chat
  turns, and tool results. It never sees keys, tokens, emails, avatar URLs or room names.
- The browser sees: answers and previews. It never sees the provider key (an Edge Function secret).
- The model's arguments are validated against the tool's schema before anything runs; unknown tools, unknown keys
  and bad values are refused. Tool text is treated as data (the prompt says so, and tools can't be chained without
  the same checks).
- Limits: 2,000 characters per request, 6 model rounds, 4 tool calls per round, the same call refused the third
  time, 15 s per tool, 25 s per model call, 50 s per request, 20 requests a minute per person (per isolate).
- Function logs carry request id, user id, tool name, duration, outcome and model. Never arguments, message text or tokens (those go to `ai_requests`, not the logs).

## Configuration

Edge Function secrets (`supabase secrets set NAME=value`):

| Secret | Purpose |
|--------|---------|
| `GEMINI_API_KEY` | the provider key. Without it the function answers 503 and the panel says AI isn't set up |
| `GEMINI_MODEL` | optional model id; default in `providers/gemini.ts` |
| `GEMINI_BASE_URL` | optional API base (a proxy, or a local stand-in for tests) |
| `AI_PROVIDER` | optional; `gemini` is the only entry in `providers/index.ts` today |
| `AI_ENABLED` | `false` switches the function off without removing anything |

Browser: nothing to configure. The header button is always shown; `AI_ENABLED=false` on the function is the off
switch (the panel then says the assistant is switched off).

Moving from the free tier to a paid key is a change of `GEMINI_API_KEY` only. Moving to another model family is a
new file in `providers/` and one entry in `providers/index.ts`.

Deploy: a push to `prod` applies the migration and deploys the function (`.github/workflows/deploy-supabase.yml`;
by hand: `supabase db push`, `supabase functions deploy ai-agent`). Set the secrets by hand, once.

## Testing

```bash
npm run test:ai                                   # no database: framework, provider adapter, drift checks
sh supabase/functions/ai-agent/tests/run-local.sh # everything, against the LOCAL stack (supabase start)
```

- The database tests create a throwaway `zz-ai-…` group and four users on the local stack and remove them.
  `tests/local.ts` refuses any URL that isn't localhost. Never point them at the hosted project.
- No test calls a real model: the agent loop uses a scripted provider and the Gemini adapter a fake `fetch`.
- To try the function by hand locally: `supabase functions serve ai-agent --env-file <file with GEMINI_API_KEY>`,
  and run the app with `npx vite --mode localdb`.
- Real-model checks are manual and few, with the admin test account in a throwaway project, never messaging real people.

## Not built yet (the registry is ready for them)

Saved questions, knowledge search (pgvector), meeting transcripts, GitHub tools, Exercises, and choosing
a subset of tools per request (`registry.list({ domain, capability, risk })` already exists; the runner takes a
`tools` filter). No embeddings or vector search exist.

## Tool → existing path (the mapping)

Tools run in the `ai-agent` Edge Function (Deno), so they cannot import the browser-bound `src/features/*/api.ts`.
Each one calls the **same table, RPC or Edge Function** the UI calls, with the caller's own token. No tool uses the
service role.

| Tool | Risk | Existing path | Permission mechanism | Side effects | Returns |
|------|------|---------------|----------------------|--------------|---------|
| `find_user` | read | `team_members` + `profiles` (as `teamMembersQuery`) | RLS: group members read the member list | none | `id`, `name`, `isYou` (no email, no avatar) |
| `search_issues` | read | `issues` filtered by group (as `teamIssuesQuery`) | RLS through `private.workspace_role()` | none | identifier, title, status, priority, assignee name, due date, project; capped |
| `get_issue` | read | `workspaces.issue_key` → `issues` by number (as `issueQuery`), labels, sprint, repo | same | none | the above plus labels, sprint, repo, estimate and a plain-text description excerpt (≤ 1000 chars) |
| `create_issue` | write | `insert into issues` (as `createIssue`), then `rpc('set_issue_labels')` | column grants, RLS, triggers `number_new_issue` and `check_issue` | activity rows (trigger); realtime echo | identifier, title, project |
| `update_issue` | write | `update issues` (as `updateIssue`), `rpc('set_issue_labels')` | column grants, RLS, `check_issue` (assignee is in the workspace, repo is linked, **status lock `DD001`**) | activity rows; **moving into In Progress creates the branch** (see below) | identifier and the changed fields |
| `find_conversation` | read | `conversations` + `conversation_members` (as `teamConversationsQuery`, `teamConversationMembersQuery`) | RLS: channels for the group, DMs and groups for their members | none (it never calls `ensure_general_channel`) | `id`, kind, title, people's names |
| `send_message` | external (confirmed) | `rpc('create_direct_conversation')` when sending to a person (get-or-create), then `rpc('send_message')` | both RPCs check group and conversation membership | notifications, unread counts, realtime echo | conversation title |
| `get_upcoming_meetings` | read | `live_sessions` by group (as `teamLiveSessionsQuery`); `rpc('workspace_people')` for "with a person" | RLS: the meeting's audience | none | `id`, title, start and end (ISO and in the person's time zone), project, status |
| `create_reminder` | write | `insert into reminders` (as `createReminder`) | RLS (owner only, group member), column grants, `check_reminder` (issue/project must be openable; an issue sets its project) | realtime echo to the owner's tabs; pg_cron fires it into the bell later | the reminder: title, time in the person's zone, issue, project, `id` |
| `list_reminders` | read | `reminders` by group, user and status (as `remindersPageQuery`) | RLS: only your own | none | the above per reminder, `total`; ≤ 20 |
| `update_reminder` | write | `update reminders` (as `updateReminder`; `status = 'pending'` to reopen) | same; moving the time later re-arms it (trigger) | realtime echo | the reminder and what changed |
| `complete_reminder` | write | `update reminders set status = 'completed'` (as `completeReminder`) | same | the trigger marks its bell notification read | the reminder |
| `cancel_reminder` | write | `update reminders set status = 'cancelled'` (as `cancelReminder`) | same | same | the reminder |
| `get_meeting` | read | `live_sessions` by id (as `liveSessionQuery`), audience from `team_members` or `rpc('workspace_people')` | same | none | the above plus organizer, description excerpt, people's names (≤ 30). **Never `room_name`** |

### Behaviour the UI adds outside the database (kept on purpose)

- **Branch on In Progress.** In the app, `useUpdateIssue` calls the `github` function's `create_branch` after a move
  into In Progress when the project has linked repos; the database does not. `update_issue` and `create_issue` do the
  same call, as the caller. A branch failure never fails the issue change; it is reported beside it.
- **Idempotent send.** The browser gives every message a `client_id`. `send_message` uses the pending action's id, so
  a repeated confirmation cannot send twice even if the one-time claim were bypassed.
- **Message body.** Plain text becomes the same one-paragraph-per-line TipTap JSON the browser sends by default.
- **Issue description.** Plain text becomes a TipTap doc of paragraphs (no images).
- **Reminder times.** The model never does date arithmetic for a reminder: it passes `inMinutes`, a local `date` and/or
  `time`, or a `meetingId` with `minutesBefore` (counted from the meeting's stored start on the server; no raw timestamp is accepted, because a model once copied a UTC start's digits under a local offset and a reminder for 11:00 AM landed at 4:00 PM), and the tool turns that into an instant in the person's zone (`zonedInstant`, DST-safe:
  a skipped time lands after the gap, a repeated one is the first). A date alone keeps a reminder's time of day and a
  time alone keeps its date; a new reminder with a day but no time is a question, not 9 AM. Past times are refused.
- **Cancelling a reminder is a `write`, not `destructive`:** it is kept and can be reopened (`update_reminder`,
  `reopen: true`), so it runs without a confirmation card (the owner's choice, 2026-10-18).
- **A note must say what it is about.** "Remind me at 3pm" leaves the required title to the model, which filled it with
  "Reminder" instead of asking. `create_reminder` refuses empty or placeholder titles (`isPlaceholderTitle`: "reminder",
  "note", "todo", "something", …) with `NEEDS_CLARIFICATION`, and the prompt says to ask (2026-10-25).

### Things the tools deliberately do not do

- Create labels, sprints, channels or group conversations (only a DM is started when needed, as the UI does).
- Read message history, docs, diagrams or lessons.
- Delete anything.
