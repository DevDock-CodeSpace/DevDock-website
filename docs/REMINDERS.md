# Notes (code: reminders)

A **note** is private text in a group that may have a time (`remind_at` nullable). With a time it pops up as a card and lands in
the bell, whether or not a browser is open; without one it just stays in the list. Code, table, route and query keys say
`reminders`; the UI says Notes. Built 2026-10-18, merged with notes 2026-10-19.

## Decisions

- Lives in the header's **Notes** panel (`NotesButton` → lazy `NotesPanel`); `/t/:teamSlug/reminders` redirects there (`?note=`).
- Only the owner reads them (group admins can't). Not narrowed by the collection view.
- No delete: Done (`completed`) or Archived (`cancelled`). Leaving the group deletes them (FK to `team_members`).
- Moving a fired note to a later time re-arms it (snooze). No recurring notes. Delivery by pg_cron, no Edge Function.

## Schema and rules

`public.reminders`: `user_id` (defaults to `auth.uid()`), `team_id`, optional `workspace_id` and `issue_id`, `title` (1–200),
`notes` (≤ 2000), `remind_at`, `status` (`pending`/`completed`/`cancelled`), `completed_at`, `cancelled_at`, `notified_at`.
`private.check_reminder` (every write): the workspace and issue must pass `can_view_workspace`; an issue sets the workspace;
changing the workspace drops the issue; status changes stamp the times; moving `remind_at` later or clearing it clears
`notified_at`; at most 500 pending per person and group. RLS is `user_id = (select auth.uid())` for every operation; column grants
exclude `user_id`, `notified_at` and the stamps; there is no delete grant.

## Delivery

pg_cron `fire-due-reminders` runs `private.fire_due_reminders()` every minute: one statement claims due rows (`skip locked`, ≤ 500),
sets `notified_at` and inserts a `notifications` row (kind `reminder`, dedupe key `reminder:<id>:<epoch>`). It can't notify twice
for the same time; a failed insert marks nothing and retries next minute; overdue notes fire once. A note without a time never fires.
Completing or archiving marks its notification read. `purge-cron-history` trims `cron.job_run_details` daily.

## Frontend

- `NotePopups` (in `AppLayout`) reads the bell's own query and shows up to 3 cards for fresh unread `reminder` notifications not yet
  shown in this browser (localStorage), with **Done** and **Snooze 10 min**. Only while the app is open; the bell has it either way.
- The bell embeds the note's title and issue; a click opens the issue, else the Notes panel outlining the note.
- New note: "Show this note to me at a set time" is off by default (on from an issue's note button, which mounts only while open).
- Status changes are optimistic and `useSetReminderStatus` returns a promise: keep toasts on the promise (the row unmounts).
- `reminders` is in the realtime publication; `['reminders', 'issue-options', …]` is in `NOT_LIVE`.

## Calsko AI

`tools/reminders.ts`: `create_reminder`, `list_reminders`, `update_reminder`, `complete_reminder`, `cancel_reminder`, all through
the same table under RLS. Times: see `docs/AI_AGENT.md`. With no time it asks; `withoutTime: true` saves a plain note.

## Tests and limits

`supabase/tests/reminders.sql` (27 checks, local only, rolls back) and `npm run test:reminders` (labels across DST).
Limits: in-app only (no email or push), one-minute resolution, no shared or recurring notes.
