# Notes (formerly Reminders)

> **2026-10-19:** Reminders became **Notes**. A note is private text that may have a time (`remind_at` is nullable; migration `20261019210000`). With a time it pops up as a card on the right of the screen (`NotePopups`) and lands in the bell; without one it just stays in the list. A header button beside Ask DevDock opens a panel of all your notes (`NotesButton`/`NotesPanel`). Statuses read Done and Archived in the UI (`completed`/`cancelled` in the database). Ask DevDock asks whether a note should show up at a time unless told to save it plain (`withoutTime`). The code, table, route and query keys keep the name `reminders`. Everything below still holds except where it says a reminder always has a time.

Private, time-based reminders to self: "Review CAP-12, tomorrow at 9". Each one belongs to one person in one group, can be about a workspace and an issue in it, and puts a notification in that person's bell when it's due, whether or not a browser is open.

Built 2026-10-18, with Ask DevDock tools (see [Ask DevDock](#ask-devdock)).

## Decisions

| Question | Decision | Why |
|---|---|---|
| Where it lives | A sidebar item under the group tools (`/t/:teamSlug/reminders`), not a workspace tab and not in `TEAM_TOOLS` | Team tools are shared views of the same data at two levels; reminders are private and have no workspace view |
| Collection view | Not narrowed: the page shows all of your reminders in the group | Personal, like Messages. A reminder about a workspace in another collection is still yours |
| Who can read them | Only the owner. Group owners and admins can't | They're notes to self |
| Delete | No delete; cancel instead. Leaving the group deletes your reminders in it | Keeps the history; nothing dangling after you leave |
| Editing a reminder that already fired | Moving it to a later time lets it fire again (a snooze). Other edits don't re-fire it | Snoozing is the common need; nothing extra to track |
| Delivery | pg_cron runs a SQL function once a minute, no Edge Function | No HTTP hop, no secrets, no API log lines, and claiming + notifying commit together |
| Notification | The existing bell (`notifications`, kind `reminder`) | One notification centre; it's already live over Realtime |
| Recurring reminders | Not built | Not trivial with this schema; a separate feature |

## Schema

`public.reminders` (migration `20261018120000_create_reminders.sql`):

| Column | Notes |
|---|---|
| `user_id` | Defaults to `auth.uid()`; clients have no grant on it. FK `(team_id, user_id) → team_members` cascades, so leaving the group removes them |
| `team_id` | The group. Not changeable after creation |
| `workspace_id` | Optional. FK `(workspace_id, team_id) → workspaces` keeps it in the group; deleting the workspace sets it null |
| `issue_id` | Optional. FK `(issue_id, workspace_id) → issues`; deleting the issue sets it null |
| `title` | 1–200 characters, trimmed |
| `notes` | Up to 2000 characters, trimmed, empty → null |
| `remind_at` | `timestamptz` (UTC instant). The browser enters and shows it in local time |
| `status` | enum `reminder_status`: `pending`, `completed`, `cancelled` |
| `completed_at`, `cancelled_at` | Stamped by the trigger when the status changes; cleared on reopen |
| `notified_at` | Set only by the scheduler. Null = hasn't fired at its current time |

`notifications` gained `reminder_id` (cascades) and the kind `reminder`.

Indexes: `(user_id, team_id, status, remind_at)` for the page; a partial `(remind_at) where status = 'pending' and notified_at is null` for the scheduler, which therefore only ever looks at what's waiting to fire.

### Rules (`private.check_reminder`, before insert/update)

These apply to every write, wherever it comes from:

- An issue must be in the same group and in a workspace the caller can open (`private.can_view_workspace`, the same helper every policy uses), and it **sets the reminder's workspace**. A workspace given on its own must also pass `can_view_workspace`.
- Moving a reminder to another workspace, or to none, drops its issue. The cascade from a deleted workspace hits this too, so a reminder is never left pointing at an issue without its workspace.
- Clearing a workspace or issue needs no check. FK cascades run as whoever deleted the row, not as the owner.
- On insert the status is forced to `pending`. A status change stamps `completed_at`/`cancelled_at` (reopening clears both).
- Moving `remind_at` into the future clears `notified_at` (the snooze).
- At most 500 pending reminders per person and group.

### RLS and grants

- `select`, `insert`, `update`: `user_id = (select auth.uid())`. Insert also requires `private.is_team_member(team_id)`.
- Column grants: insert `(team_id, workspace_id, issue_id, title, notes, remind_at)`; update `(workspace_id, issue_id, title, notes, remind_at, status)`. No delete grant.
- `notified_at`, `completed_at`, `cancelled_at` and `user_id` can't be written by clients.

## Delivery

```
pg_cron "fire-due-reminders" (* * * * *)
  └─ private.fire_due_reminders()            one statement:
       due   = pending, notified_at null, remind_at <= now()   (partial index, oldest first, 500 a run)
               for update skip locked
       fired = update … set notified_at = now()
       sent  = insert into notifications (kind 'reminder', reminder_id, dedupe_key 'reminder:<id>:<epoch of remind_at>')
               on conflict (recipient_id, dedupe_key) do nothing
```

- **Once only:** the dedupe key is unique per recipient and includes the time. Running twice, or two overlapping runs (`skip locked`), can't notify twice for the same time. A snoozed reminder has a new time, so it gets a new key.
- **Failures retry:** marking and inserting are one statement. If the insert fails, nothing is marked and the next minute tries again. No error column is needed.
- **Missed minutes:** an overdue reminder (the job didn't run) fires once on the next run. Overdue reminders are never discarded.
- **Completed and cancelled** reminders never match `due`. Completing or cancelling also marks the reminder's unread notification read (`private.clear_reminder_notifications`), so the bell empties.
- **Housekeeping:** a daily job `purge-cron-history` deletes `cron.job_run_details` older than two days. A run every minute writes about 1,440 rows a day.
- **Cost:** the job runs inside Postgres, so it adds no API request or log line. With nothing due it is one index lookup on an empty partial index.

The function is `security definer` with `execute` revoked from every client role. Only pg_cron (as `postgres`) calls it.

## Notifications (the bell)

`notificationsQuery` embeds `reminder:reminders(title, workspace_id, issue:issues(number))`, in the same single request as before. A reminder notification shows its title and "Reminder · <when>". Clicking it marks it read and opens:

1. the issue (`…/w/:workspaceId/issues/:number`) when the reminder has one the person can still open;
2. otherwise `…/reminders?r=<id>`, which outlines that row for a moment.

The bell is not a toast: a reminder that fires while you're looking raises the badge count (Realtime refetches the bell). Browser or system notifications are not built.

## Frontend

```
src/features/reminders/
  api.ts       types, reminderKeys, remindersPageQuery, reminderIssueOptionsQuery,
               createReminder / updateReminder / setReminderStatus (+ complete/cancel/reopen)
  hooks.ts     useCreateReminder, useUpdateReminder, useSetReminderStatus (optimistic, returns a promise)
  when.ts      local-time labels ("Tomorrow · 9:00 AM"), quick times; pure, Deno-tested
  loaders.ts   remindersLoader: starts Upcoming and Completed together
  components/ReminderDialog.tsx   new / edit (also used from the issue page)
  components/ReminderList.tsx     ReminderSection + rows
src/routes/team/RemindersPage.tsx
```

- **Page:** Upcoming (pending, soonest first; overdue ones in red stay until you complete them), Completed (latest first), and Cancelled behind **Show cancelled** (`?show=cancelled`, loaded only then). Each section pages 25 at a time with `count: 'exact'`, like Meetings (`LoadMore`, now shared in `src/components/LoadMore.tsx`).
- **Rows:** the circle completes (or reopens), the title opens the editor, ⋯ has Edit / Mark complete / Cancel reminder / Reopen. Completing and cancelling are optimistic and have Undo.
- **Dialog:** title, quick times (in 1 hour, this afternoon, tomorrow, next Monday), a date field (DevDock's month calendar, `DateField`) and a time field (`TimeSelect`: half-hour list, AM/PM switch, any typed time), shared with the Meetings dialog, workspace (every workspace you can open in the group), issue (loaded only when the picker opens: one request with the workspace's key), and notes. The times come from `features/live/time.ts` (`toLocalInputs`/`fromLocalInputs`), like Meetings.
- **Issue page:** an alarm-clock button next to "Copy branch name" opens the dialog with the workspace and issue filled in. It is mounted only while open, so the issue page loads nothing for reminders.
- **Route:** `lazy: { loader, Component }`, so neither the loader nor the page is in the first load.
- **Times:** stored as instants and shown with `Intl` in the browser's zone and locale. Day labels compare calendar days, so DST doesn't shift "Tomorrow".

### Live updates and requests

- `reminders` is in the `supabase_realtime` publication. `AFFECTS.reminders = [['reminders', 'list']]`, and `reminders` is a live root (`lib/live.ts`). Only the owner's tabs receive its events (RLS).
- Own writes drop their echo (`ownSave` for edits and status changes, `ownWrite` after a create) and refetch the lists themselves.
- `['reminders', 'issue-options', …]` reads `issues`, so it's in `NOT_LIVE`.
- Measured on the local stack, 2026-10-18:
  - Home: 11 requests, unchanged.
  - Reminders, first visit: **2 requests, started together**. Return visit: 0.
  - Opening "Add reminder" on an issue: 0.
  - First-load JS: 343.6 KB, +0.7 KB.
- When a reminder fires, the owner's open tabs refetch the bell (1 request) and, if they have the Reminders lists cached, those lists (up to 2). Nobody else's tabs are affected.

## Tests

- `supabase/tests/reminders.sql`: 27 checks, re-runnable, rolled back, **local database only**:
  - the owner, and that nobody else can read or edit a reminder;
  - that a workspace or issue the owner can't open, or one in another group or a group they aren't in, is refused;
  - the client can't set the owner or `notified_at`;
  - status stamps, reopen, and that clearing the workspace drops the issue;
  - firing twice gives one notification; future, completed and cancelled reminders don't fire; an overdue one does;
  - snooze fires again exactly once; completing clears the bell;
  - deleting an issue or workspace keeps the reminder; leaving the group deletes it.

  ```
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/reminders.sql
  ```
- `npm run test:reminders` (Deno, `TZ=America/Chicago`): calendar-day labels across DST, and the quick times.
- Browser, against the local stack with pg_cron running, 16 checks:
  - create, edit and reschedule;
  - a past time fires within a minute, with the browser on another page;
  - the bell shows both reminders; one opens its issue, the other opens the Reminders page with the row outlined;
  - complete, Undo, complete again, cancel, and Show cancelled;
  - the issue page's dialog comes prefilled and makes no request.

## Ask DevDock

Built 2026-10-18 in `supabase/functions/ai-agent/tools/reminders.ts` (one line in `tools/index.ts`). The tools call the same table as the page, with the user's token, so RLS, the column grants and `check_reminder` decide; no tool has SQL of its own or the service role. Mapping and risks: `docs/AI_AGENT.md`.

| Tool | Same as | Risk |
|---|---|---|
| `create_reminder` | `createReminder()` | write |
| `list_reminders` | `remindersPageQuery` (plus `overdue`, a day or week, words from the title) | read |
| `update_reminder` | `updateReminder()`, and reopen | write |
| `complete_reminder` | `completeReminder()` | write |
| `cancel_reminder` | `cancelReminder()` | write: reversible, so no confirmation card (owner's choice) |

- **Times** come as minutes from now, a local date and/or time, or an exact ISO time (e.g. 15 minutes before a meeting from `get_upcoming_meetings`), and are turned into an instant on the server in the person's zone. A day without a time is asked about; past times are refused.
- **References:** an issue as `CAP-12` (the open issue for "this"), a project by name, a reminder by its id or by words from its title. Several matches come back as candidates to ask about.
- **Only the user's own:** there is no way to set or see someone else's reminders.
- Tests: `tests/provider.test.ts` (catalogue, `zonedInstant` across DST) and `tests/tools.test.ts` against the local stack (times, references, privacy, ambiguity, complete/cancel/reopen, and the agent loop with no confirmation card).
- Not done: `/privacy` doesn't yet say that reminder titles and notes reach the model when the user asks Ask DevDock about them (the owner deferred it, 2026-10-18).

## Known limitations (V1)

- In-app only: no email, push or system notifications, and no sound or toast when one fires. The badge count is the signal.
- Resolution is one minute (the cron schedule).
- No recurring reminders, no shared or assigned reminders, no cross-group view.
- An issue renamed while the Reminders page is open shows its old title until the lists refetch (issue events don't invalidate reminder lists).
- If you lose access to a workspace, your reminders about it stay, but the workspace and issue links disappear (the embed returns null under RLS), and a click from the bell falls back to the Reminders page.
