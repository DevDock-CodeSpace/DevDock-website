# DevDock: project status

_Last updated: 2026-09-25 (Phase 5a: Docs)_

A handoff for anyone (human or AI) planning the next phase. For conventions, see [CLAUDE.md](../CLAUDE.md); for setup, see [README.md](../README.md).

## What DevDock is

A private software-engineering teaching workspace for one instructor and a few students. It's not a public product: optimize for clarity, low maintenance and low hosting cost. Repo folder `DevDock-website`. Default branch `prod`.

**Stack:** React 19 + TypeScript (strict) + Vite, React Router 7 (data mode), Tailwind v4, shadcn/ui, TanStack Query, and Supabase (Postgres, Auth, RLS). Planned: TipTap, draw.io, Jitsi Meet, GitHub links, Vercel hosting.

## Phases

| Phase | Status | Branch / commit |
|---|---|---|
| 0: Project setup | ✅ Done | `prod` |
| 1: Frontend shell (mock data) | ✅ Done | `prod` |
| 2: Supabase foundation | ✅ Done (migration applied to hosted project) | merged to `dev` (PR #1) |
| 3: Google authentication | ✅ Done: sign-in verified with a real Google account | merged to `dev` (PR #2) |
| 4a: Role model schema (workspaces, courses, memberships) | ✅ Done: migration applied, types generated; **no frontend yet** | `feat/workspace-roles` |
| 4a+: Onboarding schema (invite codes) | ✅ Done: migration applied, types generated; no frontend yet | `feat/workspace-roles` |
| 4b: Workspaces and courses UI | ✅ Committed (`bb8ac45`); superseded by 4d and verified through it | `feat/workspace-roles` |
| 4c: Rename to Team → Workspace (schema) | ✅ Migration applied, types regenerated (`541e04b`) | `feat/workspace-roles` |
| 4d: Rename to Team → Workspace (frontend) | ✅ Done: manually verified with two real Google accounts | `feat/workspace-roles` |
| 4e: UI redesign (Linear/Notion-style) | ✅ Committed (`1dbce27`); visually inspected with mocked data | `feat/workspace-roles` |
| 4f: Configurable workspace tools (modules) | 🟡 Migration applied, types regenerated, UI built; checks pass; not yet clicked through with real accounts | `feat/workspace-roles` |
| 4g: UI cleanup (sidebar by workspace type, overview, header) | 🟡 Frontend only; checks pass; visually inspected with mocked data, not with real accounts | `feat/workspace-roles` |
| 4h: Team-level tools (Docs, Diagrams, Live) nav + placeholder pages | ✅ Merged to `prod` (PR #3, with 4f/4g) | `prod` |
| 5a: Docs (documents table, RLS, list/create/edit/delete) | 🟡 Migration applied to hosted project, types regenerated; RLS verified locally (50/50); UI checked with mocked Supabase; **not yet clicked through with real accounts** | `feat/docs` |

### Phase 1: frontend shell
- Collapsible sidebar (slide-out panel on mobile) with Overview, Lessons, Live Class, Resources, Members and Settings; a breadcrumb header; and a light/dark/system theme.
- Routes: `/app` plus `/courses/:courseId`, `…/lessons`, `…/live`, `…/resources`, `…/members` and `…/settings`, with a 404 page and an unknown-course error page.
- Mock course "Software Engineering Fundamentals" (SEF-101) with 8 lessons (01 Computer Basics … 08 APIs), in `src/features/courses/mock-data.ts`.
- Data pattern: `features/<name>/api.ts` exports `queryOptions`; the layout loader primes the cache; pages read with `useSuspenseQuery`.

### Phase 2: Supabase foundation
- Typed browser client `src/lib/supabase.ts`, which uses the publishable key only and refuses secret or service-role keys.
- Migration `20260924214141_create_profiles.sql`, **applied** to project `ejqrrxxiatvvdiyxtvid`:
  - `profiles` table and a `set_updated_at()` trigger.
  - RLS on, with two policies: read own row, update own row.
  - Narrowed grants: `anon` gets nothing; `authenticated` can SELECT and can UPDATE only `display_name` and `avatar_url`.
  - `on_auth_user_created` trigger that creates the profile from OAuth metadata.
- `src/types/database.types.ts` is generated from the live project (`npm run db:types`).

### Phase 3: Google authentication
- **Flow:** Supabase Auth with Google, PKCE. `/login` → Google → Supabase → `/auth/callback` → the originally requested page.
- **Route protection:** in the authenticated layout's loader (`requireUser`), before render. Unauthenticated users go to `/login?next=…`, and signed-in users visiting `/login` go on to `next` or `/app`.
- **Session:** persisted by supabase-js in localStorage and auto-refreshed. An `onAuthStateChange` watcher clears the query cache and re-runs the guards when the identity changes, including sign-out in another tab.
- **Sidebar user menu:** the real name, avatar and email (from `profiles`, falling back to Google metadata), and **Sign out**.
- **Verified with a real Google account:**
  - Sign-in succeeded.
  - The trigger created exactly one `profiles` row, with display name and avatar filled.
  - RLS and both policies are unchanged.
- **Verified by automated browser tests (32 checks):**
  - Redirects for logged-out users, including `next` preservation and open-redirect protection.
  - Callback error handling (cancelled, provider error, missing code).
  - A readable message when Google is disabled.
  - With a simulated session: refresh persistence, sign-out, cross-tab sign-out, and the profile-failure fallback.
  - Unknown routes still return the 404 page.
  - The request to Google carries the correct `redirect_uri`, PKCE `code_challenge` and scopes.
- **No database migration was needed.**

### Branding (after Phase 3)
- Renamed the product from DevDoc to **DevDock** everywhere: UI, `<title>`, docs, package name, and storage keys (`devdock-theme`, `devdock:auth-next`).
- Logos are in the repo: originals in `brand/source/`, transparent masters in `brand/`, web versions in `src/assets/brand/`, and favicons in `public/`, all generated by `brand/build.py`.
- The logo appears in the sidebar, on the login page and on the loading screen, with a dark-mode wordmark variant.

### Phase 5a: Docs
- **Migration** `20260925031322_create_documents.sql` (applied to the hosted project; types regenerated):
  - `public.documents`: `id, team_id, workspace_id (nullable), title, content, created_by, created_at, updated_at`.
    - `workspace_id` null means team-wide. Otherwise the composite FK `(workspace_id, team_id) → workspaces(id, team_id)` guarantees the workspace is in the same team. The FK reuses the existing `workspaces_id_team_key`.
    - Deleting a workspace **deletes its docs**, rather than making them team-wide where more people could read them. The workspace delete copy says so.
    - Title is 1–200 chars (trimmed); content is at most 200k chars. `set_updated_at` trigger; indexes on (team, updated), (workspace, updated) and created_by.
  - **RLS helpers:** `private.can_read_document(team, workspace)` and `private.can_write_document(team, workspace)`, both security definer and built on the existing helpers.
    - Read, team-wide: any team member. Read, workspace doc: its members plus team owners/admins.
    - Write, team-wide: team owners/admins. Write, workspace doc: its lead plus team owners/admins.
    - Outsiders get nothing.
  - **Grants:** `select` and `delete`, plus column-level `insert (team_id, workspace_id, title, content)` and `update (title, content)`.
    - `created_by` is always `auth.uid()` (the default), and clients can't supply it.
    - Scope (`team_id`/`workspace_id`) can't change after creation, so a doc can't be moved somewhere its writer couldn't create one.
- **Local RLS tests: 50/50 pass** (`scratchpad/docs-test.sql` on local Postgres with all migrations):
  - Every role (owner, admin, lead, workspace member, plain team member, outsider, anon) × create/read/update/delete.
  - A cross-team workspace is rejected, both by RLS and by the FK.
  - `created_by` spoofing is blocked, and scope/team/author columns can't be updated. `updated_at` bumps on edit.
  - A member removed from the team loses all access; a demoted lead keeps read but loses write.
  - Workspace delete cascades its docs; team-wide docs are untouched.
- **Frontend** (`features/docs/`: `api.ts`, `hooks.ts` (`useCanWriteDocs`, UI only), `loaders.ts` (`docLoader`), `components/DocList`, `DocScope`, `CreateDocDialog`):
  - **Team → Docs** (`/t/:slug/docs`): every doc the user can read, newest first, with a Scope column (Team-wide, or the workspace's type icon and title) plus author and updated.
  - **Workspace → Docs** (`…/w/:id/docs`): only that workspace's docs, with a link to all team docs. It sits under `WorkspaceToolGate`, so it 404s if the Docs tool is off.
  - **New doc:** title plus "Belongs to" (Team-wide and/or the workspaces the user can write to). The scope is fixed inside a workspace. The button is hidden when the user can't write anywhere. After creating, the doc opens.
  - **Doc page** (`DocPage`, one component for `/t/:slug/docs/:docId` and `…/w/:id/docs/:docId`):
    - Writers get an inline title and a borderless auto-growing textarea, with Save / Ctrl-Cmd+S and a Saved/Unsaved status.
    - An unsaved-changes guard covers in-app navigation (`useBlocker`) and closing or reloading the tab.
    - Delete asks for confirmation, then navigates away before invalidating.
    - Readers see a read-only view.
    - `docLoader` 404s when the doc is missing or unreadable, belongs to another team, or is opened under the wrong workspace. Breadcrumbs end with the doc title, but only when the doc belongs there.
- **Mocked-Supabase Playwright** (`scratchpad/docs-shots.mjs`, light and dark):
  - The owner's team list shows 3 docs with scopes. Scope options for the owner are Team-wide plus 3 workspaces.
  - Creating sends `{team_id, workspace_id, title}` only, then opens the doc.
  - Typing shows "Unsaved changes"; Ctrl+S sends a PATCH with `{title, content}` and the status shows "Saved".
  - The navigation guard shows "Discard unsaved changes?". Delete sends a DELETE and returns to the list.
  - The workspace tab lists only its own doc, and its doc page keeps the tabs and breadcrumbs.
  - The wrong-workspace URL, the other-team doc and a missing doc all 404. A workspace with Docs off shows "not enabled".
  - A plain team member sees no New button and a read-only doc.
  - No page errors.
- **Known limits (by design for this phase):**
  - Plain text only (no TipTap).
  - Last write wins if two people edit at once, and the doc records no "last edited by".
  - A doc can't be moved between scopes.
  - Docs don't appear in the Overview's recent activity yet.

### Phase 4h: team-level tools (frontend only)
There's no schema change, and Docs, Diagrams and Live themselves aren't built.
- **Concept (for when these tables exist):** every doc, diagram and live session has a required `team_id` and an optional `workspace_id`.
  - `workspace_id = null` means the item is team-wide.
  - `workspace_id = X` means it's assigned to workspace X.
  - **Team → Docs** lists every item the caller can access (team-wide items plus items from workspaces they can see).
  - A **workspace's Docs tab** lists only the rows with that workspace's `workspace_id`.

  Diagrams and Live work the same way. RLS on those future tables must decide access; the UI doesn't.
- **Routes:** `/t/:teamSlug/docs`, `/diagrams` and `/live`, all rendered by `TeamToolPage` and generated from `TEAM_TOOLS` in `features/teams/nav.ts` (with `teamToolDefs`, `isTeamTool` and `getTeamNav().tools`).
- **Sidebar:** Home, Docs, Diagrams and Live sit on top, above the Courses/Projects/Workspaces sections. Breadcrumbs cover the new pages.
- **Placeholder page:**
  - A "No docs yet · coming soon" empty state explains the team-wide vs workspace scope.
  - **"Where docs will come from"** lists Team-wide plus each visible workspace that has the tool enabled (counts are 0), with links to that workspace's tab.
  - A note counts the visible workspaces that have the tool turned off.
  - To support this, `teamWorkspacesQuery` now also selects `workspace_modules(module)`. That's a query change, not a schema change, and it's readable by the same audience as the workspace row under RLS.
- **Workspace Docs/Diagrams/Live tabs** now say they show only that workspace's items and link to the team page.
- **Unchanged:** `workspace_modules` and the workspace tabs. Issues, Learning, Exercises, GitHub (and Resources) stay workspace-only, and `/t/:slug/issues` is a 404.
- **Checked:** typecheck, lint and build pass. Mocked Playwright (`scratchpad/teamtools-shots.mjs`), light and dark:
  - The top of the sidebar reads Home | Docs | Diagrams | Live, with the active state and breadcrumbs correct.
  - The learning team's Diagrams page lists 2 sources plus "1 workspace has the Diagrams tool turned off".
  - A team member (not an admin) sees only their own workspaces as sources.
  - The workspace Docs tab links to `/t/…/docs`.
  - No page errors.

### Phase 4g: UI cleanup (frontend only)
No schema, RLS or permission changes, and no new features.
- **Sidebar groups by workspace type, not team type.** Sections are Courses, Projects and Workspaces (general); empty sections are hidden. Any team can hold any type. Team type only decides which section comes first (`workspaceTypeOrder`) and the default type in the create dialog (`defaultWorkspaceType`). There's one "+ New" item (owners/admins); the dialog title and button follow the selected type ("New project" / "Create project"). `workspaceNoun` was removed, and team home, members and settings copy no longer name the team's contents by team type. The team home list heading is now "All".
- **Workspace header** shows `Type · Lead` or `Type · Member` (Lead in DevDock blue). Team owners/admins who aren't in the workspace see just the type; the "team admin" label is gone. Permissions are unchanged.
- **Overview:** the Tools list is gone (the tabs already show the tools). The left column has:
  - About.
  - **Continue learning**, when the Learning tool is enabled.
  - **Active issues**, when the Issues tool is enabled.
  - **Recent activity**, built from existing data only (member joins and the workspace's creation; the 5 most recent).

  The Learning and Issues sections are empty states that link to their tab. The right rail is slightly narrower (260px): People split into Lead(s) and Members, then Details.
- The horizontal tabs are unchanged.
- **Checked:** typecheck, lint and build pass. Mocked-Supabase Playwright (`scratchpad/cleanup-shots.mjs`), light and dark:
  - A learning team with a course, a project and a general workspace shows the sections Courses | Projects | Workspaces and one New item.
  - A development team shows Projects before Courses.
  - Headers: `Course · Lead`, `Project` (owner, not a member), `Project · Member`, `Course · Member`.
  - The create dialog switches its title from "New course" to "New project".
  - No page errors.

### Phase 4f: configurable workspace tools (modules)
Migration `20260925024234_add_workspace_modules.sql`, **applied** to the hosted project; types regenerated.

- **Schema:**
  - Enum `workspace_module` (issues, docs, diagrams, github, live, learning, exercises, resources).
  - Table **`workspace_modules`** (`workspace_id`, `module`, `created_at`) with **PK (workspace_id, module)**, which guarantees uniqueness. Deleted with its workspace.
- **Defaults:** `public.default_workspace_modules(type)`. These are defaults only.
  - Project: Issues, Docs, Diagrams, GitHub, Live
  - Course: Learning, Docs, Diagrams, Exercises, Resources, Live
  - General: Docs, Diagrams, Resources, Live
- **Backfill:** every existing workspace got its type's defaults. Live: Capstone-test (project) and Software Dev (course).
- **RLS:**
  - **Read:** anyone who can see the workspace (team owner/admin or a workspace member), via the new helper `private.can_view_workspace`.
  - **Insert/delete:** team owner/admin or the workspace **lead** (`private.can_manage_workspace`).
  - No UPDATE. Anonymous users are denied.
- **RPCs** (both `security invoker`, so RLS applies exactly as for direct writes; they only add atomicity):
  - `create_workspace(team_id, title, description, type, modules[])` creates the workspace and its tools in one transaction.
  - `set_workspace_modules(workspace_id, modules[])` replaces the tool set. It raises 42501 for non-managers, so a no-op can't silently "succeed".
- **Frontend:**
  - **Tabs** are generated from the enabled tools: Overview, then the enabled tools in a fixed order (Learning, Issues, Docs, Diagrams, Exercises, GitHub, Resources, Live), then Members. Overview and Members are always present.
  - **Create dialog:** a tool picker whose defaults follow the chosen type until the user edits it.
  - **Workspace Settings:** a **Tools** section (owner/admin/lead) with save and "reset to defaults". The type is now just a label.
  - **Overview:** lists the enabled tools, with "Manage tools".
  - **Disabled tools:** a tool that isn't enabled shows "This tool isn't enabled in this workspace."
- **Concept for later** (not built): team-level tools (Team Docs, Team Live) show all of the team's content, while a workspace's tab shows only content assigned to that workspace. `workspace_modules` only records which tools are switched on.
- **Verified:**
  - **Locally before pushing:** the backfill on pre-existing workspaces, plus **21 new checks**: RPCs store exactly the chosen tools; duplicates and unknown modules are rejected; no UPDATE; the lead can manage only their own workspace; a member can read but not change; outsiders and anon are denied; tools cascade on workspace delete. The earlier 62-check role suite and 28-check onboarding suite still pass.
  - **Live:** backfill confirmed, RLS on.
  - **UI with mocked data:** course, project, and trimmed general workspaces render the expected tabs; a disabled-tool URL is handled; the create-dialog defaults switch with type; the settings Tools section renders in light and dark.
  - `npm run typecheck`, `npm run lint` and `npm run build` pass.

### Phase 4e: UI redesign
UI only. There are no changes to Supabase, RLS, permissions or features.
- **Layout:** content aligns left next to the sidebar, with 32–48px padding and up to 1200px wide. The header bar is slimmer (48px). There are fewer cards; lists, type and hairline separators do the work. DevDock blue (`--brand`) is used only for accents: the active tab underline, the active nav icon, lead/owner labels and the focus ring. The corner radius is tighter (0.5rem).
- **Sidebar = hierarchy:** team switcher; Home; the team's workspaces listed directly (labelled Courses, Projects or Workspaces by team type); "+ New …" for owners/admins; Team → Members and Settings; the account menu at the bottom.
- **Workspace:** a header (type, your role, title, leads, a settings gear for managers) with **horizontal tabs** by type:
  - Course: Overview, Learning, Docs, Diagrams, Exercises, Resources, Live, Members
  - Project: Overview, Issues, Docs, Diagrams, GitHub, Live, Members
  - General: Overview, Docs, Diagrams, Resources, Live, Members

  Feature tabs are "coming soon" placeholders (a `:tab` route, validated per type; tabs that don't belong to the type show a 404). Settings is reached from the gear.
- **Screens:**
  - **Team home:** a compact table (name and description, type, leads, member count, your role, updated) instead of cards.
  - **Overview:** a flat About section and the upcoming sections, with a side column for People and Details.
  - **Members:** dense rows.
  - **Settings:** sections with headings and separators, and a danger zone at the bottom.
- **Data:** `teamWorkspacesQuery` now also returns `updated_at` and each workspace's leads, for the list.
- **Verified:** typecheck, lint and build pass. The main screens were screenshotted in light and dark mode at 1440px, and on a 390px phone with the sidebar sheet, using mocked Supabase responses (no real data touched). There are no console errors and no horizontal overflow on mobile, and project-only tabs 404 on a course. The logged-out route checks pass.

### Phase 4d: Team → Workspace frontend
The UI now follows the Team → Workspace model end to end. There's no schema change in this step.

- **Routes:** `/t/:teamSlug` (the team's workspaces), `/t/:teamSlug/members`, `/t/:teamSlug/settings`, and `/t/:teamSlug/w/:workspaceId` (overview), plus `lessons`, `live`, `resources`, `members` and `settings`. The old `/w/...` URLs now 404; nothing was deployed, so there are no redirects.
- **Code:**
  - `features/teams/` holds the team data layer, loaders, hooks, nav, permissions and the switcher.
  - `features/workspaces/` holds the workspace data layer and dialogs.
  - Pages live in `routes/team/*` and `routes/workspace/*`.
  - `PersonRow` moved to `components/`.
  - The adapter aliasing from 4c is gone; code uses `team_id` directly.
- **Types in the UI:**
  - Onboarding has a team-type picker (Learning, Development, General).
  - Team Settings can change the team type.
  - New Workspace has a type picker (Course, Project, General) whose default follows the team type (learning → course, development → project).
  - Workspace Settings can change the workspace type.
  - Cards and the switcher show a type badge or icon.
  - The workspace nav shows **Lessons only for course workspaces**. "Live Class" is now "Live Session".
- **Add people to a workspace:** the dialog lists team members not yet in the workspace, then a **"Someone new?" block** with the team's newest active invite code and a copy button, or **Create invite code** (7 days, unlimited uses) when none is active. Workspace leads who aren't team admins can't see invites (RLS), so they're told to ask an owner or admin. Opening the dialog refreshes the team member list, so people who just joined appear immediately.
- **Wording:** Team, Workspace, Lead and Member throughout. Invites explain that members see no workspace until someone adds them. The last-opened team is remembered under `devdock:last-team`.
- **Verified:**
  - `npm run typecheck`, `npm run lint` and `npm run build` pass.
  - Automated browser tests, logged out (8 of 8): all new routes redirect to `/login` with `next` preserved; unknown and old `/w/…` URLs 404; there are no console errors.
  - **Manually verified with two real Google accounts (2026-09-25):**
    - The owner created a team (learning) and a workspace, then created an invite code.
    - A second account joined with the code as **member** (DB confirmed: owner plus member, invite `use_count` 1, 0 workspace memberships); the two see each other's names and avatars.
    - The owner added the member to the workspace, made them lead, and removed them. Each step reported working.

### Phase 4c: Team → Workspace rename (current model)
> **Read this first.** The Phase 4a, 4a+ and 4b sections below describe the schema *before* this rename and use the old names.

Migration `20260925010950_rename_to_teams_and_workspaces.sql`, **applied** to the hosted project. It renames everything **in place** with ALTER … RENAME, so rows, grants and foreign keys carry over. Profiles and auth users are untouched.

| Before | Now |
|---|---|
| `workspaces` | **`teams`** (+ `type` team_type, default `general`) |
| `workspace_members` (`workspace_id`) | **`team_members`** (`team_id`) |
| `workspace_invites` (`workspace_id`) | **`team_invites`** (`team_id`) |
| `courses` (`workspace_id`) | **`workspaces`** (`team_id`, + `type` workspace_type, default `general`; existing rows set to `course`) |
| `course_members` (`course_id`, `workspace_id`) | **`workspace_members`** (`workspace_id`, `team_id`) |
| enum `workspace_role` (owner/admin/member) | **`team_role`** |
| enum `course_role` (lead/member) | **`workspace_role`** |
| – | **`team_type`**: development, learning, general |
| – | **`workspace_type`**: project, course, general |
| RPC `join_workspace(invite_code)` | **`join_team(invite_code)`** (the old RPC is removed) |
| `private.*workspace*` / `*course*` helpers | `private.team_role`, `is_team_member`, `is_team_admin`, `workspace_role`, `can_manage_workspace`, `shares_team_with`, `add_team_owner`, `assert_team_has_owner`, `set_workspace_member_team` |

- **Also renamed** to match: every constraint and index (e.g. `team_members_one_owner_idx`, `workspace_members_team_id_user_id_fkey`), plus all 20 policies.
- **Unchanged guarantees:** exactly one team owner; the creator becomes owner; you join only through `join_team`, and always as member; workspace members must belong to the parent team; owner/admin/lead/member permissions; no self-promotion; peers see each other's profiles.
- **New columns:** `type` is insertable and updatable by authenticated users, subject to the same RLS as the rest of the row.
- **Verified locally before pushing** on a throwaway Postgres:
  - **Data preservation:** a team with members, a workspace, a workspace lead and an invite was created under the old schema, then the rename was applied. All row counts matched, roles and FKs were intact, and the old invite still worked through `join_team`.
  - **Suites:** the full 62-check role/RLS suite and the 28-check onboarding suite, translated to the new names, all pass.
  - **Leftovers:** no old table or function names remain, and no function body mentions them.
- **Verified live after the push:** all 6 tables have RLS on (20 new-name policies plus profiles); the `type` columns and 4 enums are present; anonymous requests get 401 on `teams` and `join_team`; `join_workspace` no longer exists.
- **Frontend at the time of 4c: data layer only, as agreed** (superseded by 4d). `src/features/workspaces/api.ts` now reads `teams`, `team_members` and `team_invites`. `src/features/courses/api.ts` reads `workspaces` and `workspace_members` (aliasing `team_id` to the old field name), and new courses get `type: 'course'`. **No UI, route or wording changed**: screens still say Workspace → Course until the frontend phase.

### Phase 4a: role model schema
Migration `20260925000709_create_workspaces_and_courses.sql`, **applied** to the hosted project. `src/types/database.types.ts` was regenerated. The frontend is unchanged and still uses mock courses.

**Tables** (RLS on for all):

| Table | Key columns | Notes |
|---|---|---|
| `workspaces` | `id`, `name`, `slug` (unique, lowercase-dashed), `created_by`, timestamps | Creator automatically becomes owner |
| `workspace_members` | PK (`workspace_id`, `user_id`), `role` owner/admin/member, `joined_at` | Exactly one owner per workspace |
| `courses` | `id`, `workspace_id`, `title`, `description`, `created_by`, timestamps | Belongs to one workspace; can't be moved |
| `course_members` | PK (`course_id`, `user_id`), `role` lead/member, `joined_at` | Also stores `workspace_id` (set by trigger) for the membership FK |

- **Roles** exist only in the membership tables (Postgres enums `workspace_role` and `course_role`). `profiles` has no role column.
- **Workspace membership before course membership:** enforced by a composite foreign key from `course_members (workspace_id, user_id)` to `workspace_members`. Removing someone from a workspace removes them from its courses.
- **Exactly one owner:**
  - A partial unique index allows at most one owner.
  - Deferred constraint triggers ensure at least one owner, checked at commit. That allows transferring ownership inside one transaction.
  - A workspace-creation trigger inserts the owner.
  - Deleting the auth account of a user who still owns a workspace is blocked until ownership is transferred or the workspace is deleted.
- **Permissions:** Supabase's default grants are revoked. Clients can't set `created_by`, `workspace_id` on `course_members`, ids, or timestamps, and can't move a course between workspaces.
- **Helpers:** RLS helper functions live in a `private` schema, which isn't exposed by the Data API. They are `security definer` and only answer questions about the caller.

**RLS rules:**

| | Owner | Admin | Workspace member | Course lead | Outsider |
|---|---|---|---|---|---|
| See workspace and its members | ✅ | ✅ | ✅ | ✅ | ❌ |
| Rename workspace | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete workspace | ✅ | ❌ | ❌ | ❌ | ❌ |
| Add workspace members | admins and members | members only | ❌ | ❌ | ❌ |
| Change workspace roles | others only, never to owner | ❌ | ❌ | ❌ | ❌ |
| Remove workspace members | anyone but self | plain members | leave only | leave only | ❌ |
| See courses | all in workspace | all in workspace | assigned only | assigned only | ❌ |
| Create / delete courses | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit course title and description | ✅ | ✅ | ❌ | own course | ❌ |
| Add course members | leads and members | leads and members | ❌ | members only (own course) | ❌ |
| Change course roles | ✅ | ✅ | ❌ | ❌ | ❌ |
| Remove course members | ✅ | ✅ | leave only | members of own course | ❌ |

Any signed-in user can create a workspace and becomes its owner. Nobody can add themselves to someone else's workspace or course, or raise their own role.

**Verified:**
- **Local tests:** before pushing, the full migration history was applied to a throwaway local Postgres (with Supabase's `auth` schema stubbed) and 62 RLS/grant checks passed. The owner invariants were checked separately: a second owner is rejected, removing the only owner is rejected, a transfer inside one transaction succeeds, and deleting an owner's account is blocked. This testing caught and fixed a trigger bug before anything reached the hosted database.
- **After the push:** all 5 public tables have RLS on; the new tables have 4 policies each; anonymous REST requests get 401; the private helpers aren't callable over RPC.

### Onboarding schema (invite codes)
Migration `20260925001632_add_workspace_invites.sql`: tested locally (28 checks), then **applied** to the hosted project, and types regenerated. After the push, anonymous requests to `join_workspace` and `workspace_invites` get 401.

**The flow it supports:**
1. **Zero workspaces:** a signed-in user with no `workspace_members` rows has no workspaces, and the app shows onboarding (`select … from workspace_members where user_id = auth.uid()` returns nothing).
2. **Create:** `insert into workspaces (name, slug)`. The creator becomes **owner** (trigger from 4a).
3. **Join:** `rpc('join_workspace', { invite_code })`. The caller becomes a **member**, never admin or owner, and the function returns the workspace id.
4. **Repeat:** either path works again later, so a user can be in many workspaces with a different role in each.
5. **Courses stay separate:** joining a workspace grants no course access. An owner, admin or lead still adds `course_members`.

**`workspace_invites` table:** `code`, `workspace_id`, `created_by`, `created_at`, optional `expires_at` and `max_uses`, and `use_count`.
- **Codes:** generated server-side as `XXXX-XXXX-XXXX`, 48 random bits. Clients can't choose them.
- **Access:** only the workspace's owner and admins can view, create, or revoke (delete) invites. Nobody can update an invite; `use_count` changes only inside `join_workspace`.

**`join_workspace(invite_code)`:**
- `security definer`; callable only by signed-in users, not `anon`.
- Accepts any case, with or without dashes.
- Locks the invite row, so concurrent joins can't exceed `max_uses`.
- Joining when already a member is a no-op and doesn't use up the invite.
- Unknown, expired, used-up and revoked codes all return the same `invalid_invite` error, so callers can't probe which codes exist.
- It's the only way to add yourself to a workspace; direct inserts are still blocked by RLS.

### Phase 4b: workspaces and courses UI
**Schema addition:** migration `20260925002856_profiles_visible_to_workspace_peers.sql`, **applied**. It adds one `profiles` SELECT policy: you can read the name and avatar of people who share a workspace with you. There's no visibility otherwise, and profiles are still editable only by their owner. It was tested locally: a peer is visible, a non-peer isn't, a peer's profile can't be edited, and `anon` is denied.

**Frontend.** The mock data is removed (`mock-data.ts` and the pages built on it).
- **`/app`:** goes to the last-used workspace, or `/onboarding` when the user has none.
- **`/onboarding`:** create a workspace (name, with an auto-generated editable URL slug) → owner; or join with an invite code → member. Also reachable later from the workspace switcher ("Create or join a workspace").
- **Sidebar:** workspace switcher (all workspaces, with your role in each), Workspace nav (Courses, Members, Settings), a course nav group when inside a course (Settings only for course leads and workspace owners/admins), and the user menu.
- **Courses (`/w/:slug`):**
  - Owners/admins see every course and can create one.
  - Members see only assigned courses, and get an empty state that explains why.
  - Each card shows your role and the member count.
- **Workspace Members:**
  - Everyone sees the member list with roles.
  - The owner can make someone admin or member.
  - The owner or an admin can remove members, as allowed by RLS.
  - Owners and admins also get **invite codes**: create (7 days, 30 days or no expiry; 1, 10 or 30 uses, or unlimited), copy, and revoke.
- **Workspace Settings:** owners/admins rename; members and admins leave; the owner deletes (by typing the name to confirm).
- **Course Overview:** member count, the leads, and links to the upcoming sections.
- **Course Members:**
  - Owners/admins and the lead can **add people from the workspace**. Only owners/admins can add or make someone a lead.
  - Owners/admins and the lead remove people as allowed by RLS; anyone can leave.
- **Course Settings:** leads and owners/admins edit the title and description; owners/admins delete the course.
- **Lessons, Live Class, Resources:** "Not available yet" placeholders.
- **Errors and feedback:** Supabase errors become friendly toasts (`lib/errors.ts`). RLS "0 rows affected" is treated as "no permission". Raw errors go to the console only.

**Verified:**
- `npm run typecheck`, `npm run lint` and `npm run build` pass.
- Automated browser tests, logged out: every new route redirects to `/login` with `next` preserved; the old `/courses/demo` URL now 404s; there are no console errors.
- **Not yet verified with a signed-in user.** Manual testing was chosen over temporary test accounts. See the checklist in the Phase 4b report.

## Current configuration (hosted)
- **Supabase URL Configuration:** Site URL `http://localhost:5173`; Redirect URLs `http://localhost:5173/**`.
- **Supabase Google provider:** enabled. Client ID and secret are set in the dashboard only; nonce checks are on; users without an email are not allowed.
- **Google OAuth client:** web application. JS origin `http://localhost:5173`; redirect URI `https://ejqrrxxiatvvdiyxtvid.supabase.co/auth/v1/callback`.
- **Local env:** `.env` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` and is git-ignored.

## Not done yet
- **Phase 4b follow-ups:** manual testing of all flows with real accounts; ownership transfer (the schema supports it, but there's no UI or function yet).
- **Still to design:** an ownership-transfer function (the schema supports it; there's no API yet), email invitations (today: invite codes, or an owner/admin adds by user id), lessons, resources and live sessions.
- **Profile visibility between members:** needs a new, narrowly scoped `profiles` SELECT policy, e.g. "users who share a workspace". Today it's own-row only, so member lists can show roles but not other people's names or avatars. `workspace_members.user_id` and `course_members.user_id` reference `profiles`, so the API can embed them once that policy exists.
- **Later:** TipTap, draw.io, Jitsi, Storage, Vercel deployment.

## Open items and decisions for Phase 4
- **Who may use DevDock:** any Google account allowed by Google (only listed test users while the app is in *Testing* mode) can sign in, and any signed-in user can create their own workspace. They can't see or join anyone else's. If workspace creation should be restricted (e.g. instructors only), that needs a follow-up migration.
- **Deployment:** before going to Vercel, add the production origin to Supabase Redirect URLs and Site URL, and to Google's JS origins. Set the two `VITE_` env vars in Vercel.
- **Tooling:**
  - Local Node is 20 (end-of-life); `@supabase/supabase-js` is pinned to `^2.109.0` because 2.110 and later need Node 22.
  - The JS bundle is about 740 kB (220 kB gzipped) since supabase-js was added, over Vite's 500 kB advisory. Per-page code loading would fix it.
- **Merging:** everything through Phase 4h is merged to `prod` (PR #3). `dev` is behind `prod` (it stops at PR #2). Phase 5a is on `feat/docs`, branched from `prod`.
