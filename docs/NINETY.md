# Ninety (EOS) sync

Ninety (ninety.io) is software for running a company on EOS: weekly meetings around To-Dos, Rocks
(90-day goals), Milestones, Headlines, Issues and a Scorecard. Teams that work in DevDock and meet in
Ninety shouldn't type their work twice, so DevDock fills Ninety from its issues. **One way only:
DevDock → Ninety.** (Ninety has no webhooks; a change made in Ninety is replaced by the issue's next change.)

Behind the **`ninety_sync`** feature flag (switched per group by the platform admin at `/admin/flags`).

## Phases

| Phase | What | Status |
|---|---|---|
| 0 | Spike: the API works on the Free plan (create, read, complete, delete a To-Do) | done 2026-10-27 |
| 1 | Connect + **To-Dos** from sprint issues | built 2026-10-28 |
| 2 | **Rocks** from Plans, **Milestones** from their dated issues, To-Dos linked to Rocks | built 2026-10-28 |
| 3 | **Issues (IDS)** from issues labelled IDS | built 2026-10-28 |
| — | **The Ninety page**: what is in Ninety now, in DevDock | built 2026-10-28 |
| later | **Headlines** (a "Share as headline" button, optional automatic ones) | skipped for now (owner, 2026-10-28) |
| later | **Scorecard** numbers every week | skipped for now (owner, 2026-10-28) |

## Phase 1: To-Dos

**Connect** (Group settings → Ninety, owners/admins, `NinetySection`): paste a Ninety personal access token
(Ninety → Settings → Developer Settings, 365 days). The `ninety-sync` function checks it with Ninety
(`GET /teams/available`: only teams the token's owner can create work in; `GET /users`) and saves it in **Supabase Vault** (`ninety_connections.token_secret_id`);
no client can read it back. Then each project with Issues is linked to one Ninety team
(`ninety_workspace_teams`).

**Which issues:** assigned issues in the **running sprint** (`starts_on ≤ today ≤ ends_on`, UTC) of a linked project.

| DevDock | Ninety To-Do |
|---|---|
| title | `WA-12 Add login` (key + number + title, ≤ 250 chars) |
| assignee | owner, matched by **sign-in email** to a Ninety user; otherwise the connection's fallback owner (the person who connected, else Ninety's company owner) with `(for Name)` in the title |
| due date | the issue's, else the sprint's last day |
| link | the description starts with `From DevDock: <issue URL>` |
| Done / Canceled | completed; reopened → open again |
| leaves the sprint, unassigned, project unlinked | completed (not deleted) |
| deleted | deleted (Ninety deletes are soft: hidden from lists) |

Nothing is created for work that is already finished. An unchanged issue costs no request (`ninety_links.sent_hash`).

**How it runs:**

1. Triggers on `issues` (insert, delete, and updates of title / status / assignee / due date / sprint / project / number),
   on `issue_cycles` (dates) and on `workspaces` (`issue_key`) put the issue in `ninety_outbox`. Only for groups that are
   connected **and** have the flag (`private.ninety_active`). Changes from the app, Ask DevDock and GitHub are all caught.
2. pg_cron `ninety-sync` runs `private.ninety_kick()` **twice a day, 00:00 and 12:00 UTC** (owner, 2026-10-28: no job
   querying all day; it ran every minute at first). It calls the function with pg_net, carrying the Vault secret
   `ninety_cron_secret` (`x-ninety-cron`), only when something is waiting. Between runs, **anyone in the group** sends what is
   waiting with **Sync now** on the Ninety page (the function's `send`; nothing waiting = no Ninety call), and the page says how
   many changes are waiting. The function URL is recorded by the function itself on the first connect (`ninety_config`).
3. The function (`supabase/functions/ninety-sync/`) loads the queued issues in one round, asks `plan.ts` (pure, tested by
   `npm run test:ninety`) what each To-Do should be, and creates / updates / deletes it. A failing issue is retried up to
   5 times; a refused token (401/403) is shown on the settings page; Ninety's rate limit (429) waits for the next run.
4. pg_cron `ninety-sprint-edges` (00:05 UTC) queues the issues of sprints that start today or ended yesterday.

**Sync now** queues every linked issue and sends at once (also retries failed ones). **Disconnect** forgets the token, the
project links, the links to To-Dos and the queue; To-Dos already in Ninety stay. With the flag switched off nothing is queued
or sent and the section is hidden; switched back on, **Sync now** catches up.

**Cost to the app:** none outside Group settings. The section loads only there, for owners/admins of flagged groups.

## Phase 2: Rocks and Milestones

Plans are group-wide, so the group chooses **one Ninety team for its Rocks** (Group settings → Ninety → *Plans → Rocks*,
`ninety_connections.rocks_ninety_team_id`, `rpc('ninety_set_rocks_team')`; "Not sent" stops sending and leaves Ninety as it is).

| DevDock plan | Ninety Rock |
|---|---|
| name | title |
| lead | owner (by email; else the fallback owner) |
| target date | due date, and the quarter (Q1–Q4 from its month). **A plan without a target date is not a Rock.** |
| status | Not started / In progress → On track; Paused or past its target date → Off track; Done → Done; Canceled → Canceled |
| deleted | Rock deleted |
| — | level Department; description links back to the plan |

A plan that is already done or canceled doesn't become a new Rock. The daily job re-sends plans whose target date has
just passed, so their Rock turns Off track.

**Milestones:** an issue in a plan with a Rock **that has a due date** becomes one of the Rock's Milestones
(`WA-12 title`, the issue's due date, owner = assignee by email, done when the issue is Done). Ninety can't delete a
Milestone through its API, so one whose issue leaves the plan, loses its due date, is canceled or deleted is **completed and
marked "(removed)"**; moving to another plan retires the old one and makes a new one on the new Rock (`ninety_milestone_links`).

**To-Do links:** an issue's To-Do is linked to its plan's Rock (`POST /todos/:id/links`), and the link follows the plan
(`ninety_links.linked_rock_id`).

The function sends plans before issues, so a Rock made in a run is there for its issues' Milestones and links
(`ninety_queue_plan_issues`). Milestones and Rock links are left alone while no Rocks team is set.

## Phase 3: Issues (IDS)

In EOS, Issues are the problems a team Identifies, Discusses and Solves in its weekly meeting, not tasks. Only what someone
chooses goes over: **an issue labelled IDS** in a project linked to a Ninety team.

- Every linked project has an **IDS** label (violet): made when the project is linked (`private.ninety_ensure_ids_label`;
  projects linked before were given one by the migration). Any label named IDS, whatever its case, counts.
- The Ninety Issue: `WA-12 title`, owner = assignee by email (else the fallback owner), short term, a link back. Done or
  Canceled, the label taken off, or the project unlinked → **solved** (completed); labelled again or reopened → open again;
  the issue deleted → **deleted** in Ninety (Issues, unlike To-Dos, are really deleted). Sprints don't matter here.
- Adding or removing a label queues the issue (`ninety_queue_label_link`), and renaming a label to or from IDS queues its
  issues (`ninety_queue_label_rename`). `ninety_issue_links` remembers the pairs.

## The Ninety page

**Group → Ninety** in the sidebar (only with the `ninety_sync` flag; `/t/:slug/ninety`, `NinetyPage`). It shows **what is in
Ninety right now** for the Ninety teams the group sends to, read live by the function's `overview` action
(`supabase/functions/ninety-sync/overview.ts`), so people can check the sync did what it should:

- Tabs: **To-Dos** (open, and recently completed), **Rocks** (status, quarter, due, with their Milestones), **IDS** (Ninety's
  Issues; named IDS because "issues" means DevDock issues here),
  **Headlines**, **Scorecard** (each measurable's goal and its last 5 weeks).
- Each item has a chip for the DevDock **issue** (`WA-12`) or **plan** it came from, which opens it; items made in Ninety say
  "In Ninety only".
- **Anyone in the group** can open it. Items that came from an issue the reader can't open (a project they aren't in) are
  left out: the function looks those issues up **as the reader** (RLS). Plans are group-wide, so Rocks always show.
- **Sync now** (top right) sends the waiting changes for anyone in the group; a line under the title says how many are waiting.
- Cost: **one request** per visit (the function asks Ninety for every part in parallel, about 2–3 s), fresh for 2 minutes,
  a Refresh button, no polling. Nothing on the first load: the route has no loader and the sidebar item no hover prefetch,
  because both regrouped the build and cost every first load ~1 KB (measured 2026-10-28).
- If Ninety doesn't answer for a part, the rest still shows with a note naming the missing part.

## Ninety API notes

- Base `https://api.public.ninety.io/v1`, `Authorization: Bearer pat_…`. 25 requests/second per user.
- Ninety's docs say the API needs the Thrive (or Legacy) plan; on 2026-10-27 it worked on a Free plan. Customers are
  expected to be on a paid plan. A 403 is shown as "your Ninety plan may not include API access".
- To-Dos: `POST /todos` `{ title, teamId, userId, dueDate: 'YYYY-MM-DD', description }` (201), `PATCH /todos/:id`
  (`completed`, any field), `DELETE /todos/:id` (204, soft). Due dates come back at 20:59 UTC (the company's time zone).
- Rocks: `POST /rocks` `{ rock: { teamId, userId, title, dueDate, statusCode, levelCode, quarter, description } }` answers with
  a **list**; `PATCH /rocks/:id` flat fields; `DELETE /rocks/:id`. Milestones: `POST /milestones` `{ rockId, teamId, title, dueDate }`,
  then `PATCH /milestones/:id` for `ownedByUserId` / `isDone`; no delete (`isDeleted` can't be set). Links:
  `POST /todos/:id/links` `{ linkedItemId, linkedItemType: 'rock' }`, `DELETE /todos/:id/links/:rockId`. Issues:
  `POST /issues` `{ title, teamId, userId, interval: 'SHORT_TERM' | 'LONG_TERM', description }`, `PATCH /issues/:id`
  (`completed`, fields; `archived` can't be set), `DELETE /issues/:id` (a real delete). Reads for the page: `POST /todos/query/paged`
  (`completed` true/false), `POST /rocks/query/paged` (`/rocks/query` answers 400), `GET /rocks/:id/milestones`,
  `POST /issues/query`, `GET /headlines?teamId=`, `GET /scorecard/team-scorecard?teamId=`; scorecard `POST /scorecard/kpis/:id/scores`
  `{ value, periodStartDate }` and `/scorecard/scores/batch`. Measurables can't be created through the API.
- Request shapes were taken from the MIT-licensed Activepieces Ninety connector.

## Tests

- `npm run test:ninety`: the rules in `plan.ts` (22: To-Dos, Rocks, Milestones).
- `supabase/tests/ninety_sync.sql`: who can read and change what, the token never readable, queueing of issues and plans (50; Dev or local).
- Browser, end to end on DevDock Dev against a real Ninety account (2026-10-28, 33/33): connect (a wrong token refused),
  link a project, Sync now, To-Do fields, rename / done / unassign / new / reopen / delete delivered by the job,
  no request for an unchanged issue, flag off hides and stops, back on + Sync now catches up.
- Phase 2, same setup (27/27): choosing the Rocks team, Rocks' fields and owners, plans without a target date skipped,
  Milestones and their owners, the To-Do linked to its Rock; by the cron: rename + pause → Off track, done issue → done
  Milestone, moving plans → old Milestone "(removed)" + new one + relinked To-Do, deleted plan → Rock deleted and To-Do
  unlinked, done plan → Done; Rocks switched off → nothing sent, Rocks stay.
