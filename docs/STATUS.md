# Calsko: project status

_Last updated: 2026-10-30. The full phase-by-phase history is in git (`git log -- docs/STATUS.md`)._

## Where things stand

Live at `www.calsko.com` (renamed from DevDock on 2026-10-29; dev-dock.com redirects). Every feature below is built and on `prod`
unless it says otherwise. Conventions live in [CLAUDE.md](../CLAUDE.md); setup in [README.md](../README.md).

| Area | State |
|---|---|
| Groups, collections, workspaces (courses, projects, spaces), invites, roles, access settings | Built |
| Sign-in: Google, Microsoft, password admin account; per-tab sessions, inactivity sign-out | Built |
| Chat: channels, DMs, groups, threads, reactions, pins, mentions, attachments, search, unread | Built |
| Files: docs (TipTap) and whiteboards (React Flow, free drawing, Mermaid import) in shared folders | Built |
| Issues: list/board, sprints, views, activity, shortcuts, import (CSV/Linear/Notion/Jira), Plans, Issues hub, Starred | Built |
| GitHub: repos linked to projects, App connection, branch on In Progress, PR webhooks move issues | Built |
| Meetings: Jitsi via JaaS, repeating meetings, calendar view, .ics, Google Calendar sync and RSVPs | Built |
| Learning: modules, lessons, progress, a whiteboard per lesson | Built |
| Notes: private notes with an optional time that pops up (pg_cron → bell) | Built |
| Calsko AI: assistant that works through the app's own tools (flag `ask_devdock`) | Built |
| Platform admin console, per-group feature flags | Built |
| Feedback button, read in the admin console | On `dev`, not yet on `prod` |
| Calsko name, logo, favicons, whirl spinner | On `dev`, not yet on `prod` |
| Invite emails: Members → Email invites, a single-use code per address, sent with Resend (`invite-email`) | Branch `feat/invite-emails` |

## Next

- 9e: deleting an issue can delete its branch (opt-in). Branches are never deleted when an issue moves back.
- Files: "Convert to diagram" on Mermaid code blocks, then "Linked from" on the whiteboard page.
- Chat: instant calls from a conversation (needs its own audience rule in `jaas-token`); revoke the old column UPDATE grant
  on `public.messages` once every open client uses `edit_message`/`delete_message`.
- Exercises is still a placeholder page.
- Issue display options (group by, sub-group, ordering, properties) are not built.

## Known gaps

- A member can clear an issue's repo and then set Done by hand (the status lock only applies with a connected repo).
- `/privacy` doesn't yet say that note titles reach the model when Calsko AI is asked about them (owner deferred).
- Notes: in-app only (no email or push), one-minute resolution, no recurring notes.
- Issues pages load every issue of a workspace in one query; revisit before a workspace passes ~500 issues.
- The Ninety (EOS) sync was built on `feat/ninety-sync` and shelved (2026-10-29); its `ninety_sync` flag reads nothing.

## Environments

Live Supabase `ejqrrxxiatvvdiyxtvid`, Dev `aktqcsncvbmkbleghipb` (see [DEV_ENVIRONMENT.md](DEV_ENVIRONMENT.md)). GitHub repo
`DevDock-CodeSpace/calsko-website`.

Email: calsko.com sends through **Resend** (DKIM/SPF on the `send` subdomain, verified) and receives through **ImprovMX**
(root MX; the `support@` alias forwards to the owner, and more recipients are added in ImprovMX). DMARC is `p=none`. App
email goes out from `invites@calsko.com` with Reply-To `support@calsko.com`. Function secrets: `RESEND_API_KEY` (both
projects), optional `INVITE_FROM` and `EMAIL_REPLY_TO`. Request counts are tested from the private `DevDock-request-tests` repo after each `prod` push.
