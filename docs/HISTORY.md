# DevDock: what was built, in order

The phase-by-phase record moved out of CLAUDE.md on 2026-10-28. It says what exists and when it arrived; the rules for each part are in `docs/reference/`.

**Phase 1 done: frontend shell.** React Router, Tailwind v4, shadcn/ui, and TanStack Query are installed. The app has a responsive sidebar layout, light/dark/system theme, and placeholder pages driven by mock data (replaced by real data in Phase 4). TipTap (Phase 5b), React Flow (Phase 5c) and the Jitsi React SDK (Phase 5d, Live) are installed. **Add each piece only when a task needs it**, and don't build ahead.

**Phase 2 done: Supabase foundation.** `@supabase/supabase-js`, a typed browser client (`src/lib/supabase.ts`), the `supabase/` CLI project, and the first migration (`profiles` + RLS + a sign-up trigger), **applied to the hosted project** (ref `ejqrrxxiatvvdiyxtvid`, linked via `supabase link`).

**Phase 3 done: Google sign-in** via Supabase Auth (PKCE). All app routes require a session, and the sidebar shows the signed-in user's profile. Sign-in verified end-to-end with a real Google account. The app now **requires** the Supabase env vars.

**Phase 4 (in progress): Team → Workspace model is real.** A **team** (owner/admin/member; type learning/development/general) contains **workspaces** (lead/member; type course/project/general). Invite codes join a team, and workspace access is assigned separately. The UI has onboarding (create a team or join with a code), a team switcher, and real workspace, member, invite and settings pages. The mock data is gone.

**Hierarchy steps 2–3 built (see `docs/HIERARCHY_PLAN.md`): who can see a workspace, and collections.** A workspace has an `access` setting (only the people added / everyone in its collection / everyone in the group), and a group can have **collections**: optional sets of workspaces with their own people and a type. Sidebar and Home group by collection once one exists.

**Phase 5a done: Docs.** A `documents` table (team-wide or assigned to a workspace) with RLS, Team → Docs and Workspace → Docs lists.

**Phase 5b done: rich docs editor (Dropbox Paper-style).** TipTap v3 (MIT extensions only) with highlight.js via lowlight, stored as TipTap JSON in `documents.body`; images in the private `doc-images` Storage bucket. Autosave.

**Phase 5c done: Diagrams (Lucidchart-style).** A `diagrams` table (same scope and RLS rules as `documents`) holding React Flow JSON, with Team → Diagrams and Workspace → Diagrams lists and an in-app editor styled like DevDock: a shape/icon library, containers, connectors, a properties panel, undo/redo, copy/paste, alignment guides, autosave. 

**Phase 6a done: Issues (Linear-style), part 1.** Workspace-only issues with IDs like `CAP-12` (per-workspace `issue_key` + counter). Each issue has a status workflow, priority, assignee, labels, estimate, due date and sub-issues. Views are a List grouped by status and a Board with drag-and-drop; the issue page has a rich description (the Docs editor, with pasted/dropped images), sub-issues, comments and a properties panel. Any workspace member can create and edit issues. Leads and team owners/admins delete issues and manage labels and the key. 

**Phase 6b done: Issues, part 2.**
- **Cycles:** Linear's sprints, numbered per workspace and never overlapping; managers create, edit and delete them, and there's a "move open issues to the next cycle" action.
- **Views:** All / Active / Backlog / My issues tabs, and filters (status, priority, assignee, labels, cycle) kept in the URL.
- **Activity log:** written by DB triggers and shown with comments as an Activity feed.
- **Keyboard shortcuts:** Linear-style; press `?` for the list.

**Phase 5d done: Live sessions (Jitsi via JaaS).** A `live_sessions` table (same scope and RLS rules as `documents`) for scheduled video calls. The `@jitsi/react-sdk` `JaaSMeeting` is embedded and lazy-loaded; the room is only reachable with a short-lived RS256 JaaS JWT minted by the `jaas-token` Edge Function (which re-checks access under RLS and a moderator flag). Scheduling a session can create a Google Calendar event that invites everyone in the audience, using the organizer's Google token (re-obtained through OAuth about once an hour, since there's no server to hold a refresh token). Team → Live and Workspace → Live lists, a session page with Join/edit/cancel/calendar sync, and an embedded call.

**Phase 8 done: Learning** (modules → lessons → progress).

**Phase 9a done: GitHub repos, part 1** (no GitHub API yet). Repos belong to the group and are linked to any number of projects. An issue can point at one repo linked to its project (like a label), so moving an issue into a repo never changes its number. Group settings → Repositories, the project's GitHub tab, and a Repo property, filter and chip on issues. 

**Phase 9b done (needs the App's keys to be used): GitHub App connection.** Group owners/admins install the DevDock GitHub App from Group settings. The `github` Edge Function verifies the install with GitHub (the one-time OAuth code proves the person can access that installation), then saves it to `github_installations`. After that, repos are picked from what the App can see. Setup: README → GitHub App setup.

**Phase 9c/9d done: branches and PR webhooks (rules agreed with the product owner).**
- **Branches:** moving an issue to **In Progress** creates its branch (`dock/wa-2-add-login`) on GitHub. It uses the `github` function's `create_branch`, called from `useUpdateIssue` through `useCreateIssueBranch`, and starts from the project's base branch. The issue page's **Development** block offers **Create branch** to retry.
- **PR webhooks:** the `github-webhook` Edge Function moves issues:
  - PR opened or ready for review → **In Review** (drafts don't move issues);
  - closed without merging → back to In Progress;
  - merged into one of the project's **done branches** (per linked repo, set on the GitHub tab; none = the default branch) → **Done**;
  - merged into another branch (feature → `dev`) → the PR is **tracked** (`issue_pull_requests.landed_ref`). When that branch is merged onwards by a later PR (`dev` → `prod`), the tracked PRs move with it, and their issues become **Done** once they reach a done branch.
- Activity shows "GitHub" as the actor.
- **Status lock:** on issues whose repo is connected, only GitHub (`devdock.via = 'github'`) or workspace managers can set In Review or Done (`check_issue`, SQLSTATE `DD001`, message in `writeErrors`). Everyone can still reopen an issue or cancel it.
- **Merged branches:** GitHub deletes them (the repo's "Automatically delete head branches" setting); the Development block shows them as merged and links to the PR.

**Issue views done:** saved views (a name + tab + layout + filters; private or shared with the workspace), starring them into the sidebar's **Starred** list (your saved views, one person's issues, or a built-in tab), and person views (`?assignee=<id>`, from the Members page or a pin). Display options (group by, sub-group, ordering, properties) are not built.

**Issue import, Plans, the Issues hub and Starred (2026-10-27, `dock/wa-79-issues-import-system`; plan: `docs/ISSUES_HUB_PLAN.md`):** a CSV file, or the CSV exports of Linear, Notion and Jira, becomes issues in a project (file exports only, no API connections; Confluence was meant as Jira). **Plans** are Linear's projects: goals assigned to issues. The sidebar's **Issues** item is the hub (My issues, Plans, Sprints, Views, Import), and **Starred** (one ☆ for workspaces, issues, plans, views and sprints; it was called Favorites, and workspaces had a separate pin) sits under the group's Settings in the sidebar.

**Messaging (team-wide chat) done, part 1:** channels (`#general` is automatic), DMs and ad-hoc groups; threads, reactions, pins, mentions, attachments, search, unread badges, mute. Design record: `docs/MESSAGING_ARCHITECTURE.md`.

**Notes done (was Reminders, V1 2026-10-18; merged 2026-10-19):** private notes to self in a group, optionally with a time. A note with a time pops up as a card on the right of the screen and lands in the bell, whether or not a browser is open (a pg_cron job once a minute); a note without one just stays in the list. Notes button in the header beside Ask DevDock (a panel of all your notes; since 2026-10-26 the only place they live, no page), optionally about a workspace and an issue. Ask DevDock can create, list, change, complete and cancel them (`tools/reminders.ts`). The code, table (`reminders`), the old route (`/reminders`, now a redirect) and query keys still say reminders; the UI says Notes. Design record: `docs/REMINDERS.md`.

Next: 9e deleting an issue can delete its branch (opt-in). Branches are never deleted when an issue moves back.

Exercises is still a placeholder page. Current status and next steps: `docs/STATUS.md`.
