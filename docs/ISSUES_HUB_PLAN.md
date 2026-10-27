# Issues hub and Plans: plan

Status: **agreed with the owner and built (2026-10-27)** on `dock/wa-79-issues-import-system`. What's in the code is described in CLAUDE.md (Plans and the Issues hub).
Builds on the issue import (`dock/wa-79-issues-import-system`).

## In one paragraph

It works like Linear. A small group usually has **one project** (e.g. "Website application").
Issues are created in the project. **Plans** are the goals inside it ("Custom Auth Roles",
"Health Monitoring"): an issue can be put in a plan, or created straight from the plan's page, and
it still lives in the project. **Each person sees their own work first**: the hub opens on
**My issues**; a plan lists its unassigned issues so people can **pick one up** (Assign to me) as the
lead intends; the **sprint** shows who is doing what, for whoever wants to track the team. The
sidebar's **Issues** item becomes the hub where all of this happens, and **Starred** sits under the
group's Settings in the sidebar.

## How Linear's words map to DevDock

| Linear | DevDock |
| --- | --- |
| Workspace | Group |
| Team (where an issue lives: key `ENG-12`, cycles, labels) | **Project** (key `WA-12`, sprints, labels) |
| Project (a goal: lead, dates, status, progress) | **Plan** (new) |
| Cycle | Sprint |
| Label | Label |
| Views, favorites in the sidebar | Saved views, **Starred** |

Rule of thumb: a new **project** is for different people, code or sprints; a new **plan** is a new
goal for the same people.

## Decided

1. **Every issue lives in a project** (as today). Its number, labels and sprint come from there.
2. **A plan is optional and assigned to an issue**, like a label: at most one plan per issue.
3. **Plans are group-level**: the whole group sees them, anyone in the group can create one (the
   creator is its lead), and one plan can hold issues from several projects.
4. **Plans have no labels or sprints of their own.**
5. **Your own work first** (owner, 2026-10-27): the screens put what's assigned to you in front of
   you, and other people's work is where you go on purpose (a plan, a sprint). This is about what
   each screen shows, not a permission: everyone in a project can still open its issues (a plan's
   free issues and the sprint board need that).
6. **The sidebar keeps its Projects section** (docs, meetings, the rest).
7. **The sidebar's Issues item becomes the Issues hub**: issues across projects, plans, sprints,
   views and import all come out of it.
8. **Starred** (issues, plans, views, My issues, …) sit **under the group's Settings in the sidebar** (moved up from the bottom on
   2026-10-27), replacing today's Pinned section.
9. Dropped for now: issues that live in a plan before any project exists, and turning a plan into a
   project. Revisit if people ask for it.

## Plan files (owner, 2026-10-27)

- Files has a **Plans** folder (group-wide) with one folder per plan, named after it and renamed with it.
- A plan starts with a **Brief** doc (its description, previewed on the plan page) and a **Whiteboard**.
  Plans that come with an import get the folder and Brief; their whiteboard is made the first time
  someone opens it.
- Everyone in the group edits a plan's files. Plan folders can't be renamed, moved or deleted by hand.
- **Deleting a plan deletes its folder and everything in it**, after a warning that says what will go.
  Its issues stay, without a plan.

## Design

### Plans

- Table `plans` (group-level): `team_id`, name, description (TipTap, like an issue's), lead,
  status (Not started / In progress / Paused / Done / Canceled), start and target dates.
  RLS: group members read and create; the lead and group owners/admins edit and delete.
- `issues.plan_id` (nullable). Setting it needs edit rights on the issue (as today), and the plan
  must be in the issue's group (checked in `check_issue`). Deleting a plan leaves its issues.
- On issues: a **Plan** property (issue page, row menu, New issue), a **Plan** filter and
  group-by, a chip on rows.
- A plan's page: description and details, progress, **Up for grabs** (its unassigned open issues,
  each with **Assign to me**), then its issues by person, and **New issue** (in the group's only
  project automatically, else asks which one).

### The Issues hub (sidebar → Issues, `/t/:team/issues`)

```text
Issues                                       [Import] [+ New plan] [+ New issue]
────────────────────────────────────────────────────────────────────────────────
 My issues · Plans · Sprints · Views                                  ☆ star
────────────────────────────────────────────────────────────────────────────────
 Project ▾  Plan ▾  Status ▾  Assignee ▾  Label ▾                  List | Board
```

- **My issues** (the default): what's assigned to you in every project, with the same filters,
  board and row menus as inside a project. (Project filter hidden when the group has one project.)
  No "All issues" tab: other people's work is seen through a plan, a sprint or a saved view.
- **Plans**: every plan with status, lead, dates and progress; New plan.
- **Sprints**: each project's sprints, set up and followed from here; the current sprint shows the
  team's issues **grouped by person**, so a lead can see who is doing what.
- **Views**: saved views across the group.
- **Import**: moves here from project Settings. The issues go into a project (asked only when there
  are several); Linear projects become **plans** (matched by name when they exist), labels stay
  labels, cycles become that project's sprints. The "who is who" list of imported people moves here.
- **New issue**: in the only project, or asks which; optional plan.

### Starred (under Settings in the sidebar; named Favorites until 2026-10-27, renamed by the owner so it isn't Linear's word; workspace pins became stars too)

- Star anything issue-related: an issue, a plan, a saved view, a hub tab (My issues), a person's
  issues.
- Listed in **Starred** under the group's Settings in the sidebar; reorder by dragging.
- Built on today's pins (`issue_pins`): add kinds `issue`, `plan` and hub tabs, and make them
  group-level instead of per project.

## Order of work

0. **Ship the import** (commit + PR into `dev`).
1. **Make room on the first load**: we are at 344.2 of 345 KB. Lazy-load project Settings (and
   anything else heavy in the shell) before adding to the sidebar.
2. **Plans**: table, Plan property, filter and chip, plan page, Plans list. Import maps Linear
   projects to plans instead of labels.
3. **The hub**: tabs, filters and board across projects, New issue, import and the people list in
   the hub.
4. **Starred** under Settings in the sidebar (pins, workspace pins included, become stars).
5. Later, if needed: milestones inside a plan.
