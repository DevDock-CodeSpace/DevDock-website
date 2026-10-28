# Repos and the GitHub App

Read before touching `features/repos/` or the `github` / `github-webhook` functions.

- **Repos** (`features/repos/`; route `…/w/:id/github`, `WorkspaceGitHubPage`; Group settings → `TeamReposSection`):
  - `repos` belong to the group (`owner`/`name`, unique per group ignoring case); `workspace_repos` links them to projects (many-to-many, same group via composite FKs). Owners/admins add and remove repos; workspace managers link and unlink. Parse user input with `parseRepo`.
  - `issues.repo_id` must be a repo linked to the issue's workspace (`check_issue`). Unlinking clears it on that workspace's issues (`clear_unlinked_issue_repos` trigger), so invalidate `['issues']` too after unlink/delete. Changes are logged as activity kind `repo`.
  - Issue UIs read the workspace's linked repos from `useIssueContext().repos` and hide repo controls while there are none.
  - **PR webhooks** (`github-webhook` Edge Function, `verify_jwt = false`, HMAC via `GITHUB_WEBHOOK_SECRET`, `github_webhook_deliveries` dedupe):
    - Repos are matched by `github_repo_id` **and** the event's installation. Issues are found by key and number among the projects linked to that repo, **or** by the PR's head branch matching a stored `issue_branches.name` (so renaming a key doesn't break old branches).
    - All DB work is one call to `github_apply_pull_request()` (service role only). It upserts `issue_pull_requests`, logs `pr_linked`/`pr_merged`/`pr_closed`, and moves the status. It sets `devdock.via = 'github'`, so `log_issue_activity` tags rows with `via`.
    - Only a **change** in PR state moves an issue, so it never fights a manual status change.
    - **Tracking:** when a merged PR's head branch is in the same repo and isn't a done branch, the webhook calls `github_promote_merged()` per project. It moves `landed_ref` from the head branch to the base branch on that project's merged PRs, and marks their issues Done if the base is a done branch. It skips issues that are done or canceled, have another PR open, or whose status a person changed after the merge. Direct pushes (no PR) aren't tracked.
    - Also handles `installation.deleted` and `installation_repositories` (marks repos connected / not connected).
    - Branch names come from `issueBranchName()` (`meta.ts`); the `github` function has a copy (`branchName`). Keep the two in sync.
  - **Branches** (`issue_branches`, one per issue × repo; written only by the `github` function's `create_branch`):
    - It reads the issue and links **as the caller** (RLS), uses the issue's repo or the project's only repo (and then sets it as the issue's repo), and starts from `workspace_repos.base_branch` or the default branch.
    - It adopts a branch that already exists, and is idempotent.
    - Branches are never deleted when an issue moves back.
  - **Done branches:** `workspace_repos.done_branches` (up to 10; empty = the default branch; managers edit them in `RepoBranchSettingsDialog`, with names from the `branches` action). The webhook passes `p_merged_into_done` per project.
  - **GitHub App** (`github` Edge Function, actions `connect`/`repos`/`add_repo`/`create_branch`/`branches`; client wrappers in `repos/api.ts`):
    - Only the function writes `github_installations`, `repos.github_repo_id` and `repos.installation_id`. Clients have no grants for them. It uses the service role *after* its own checks (owner/admin, and GitHub confirming access).
    - Connect flow: `rpc('start_github_connect')` returns a one-time state (30 min, tied to the person and group), then `github.com/apps/<slug>/installations/new?state=`, then `/github/callback` (`githubCallbackLoader`), then the function, then back to Group settings.
    - `installation_id` null means **Not connected** (added by name, or disconnected; the FK sets it null). Adding the same repo from GitHub connects the existing row.
    - Disconnecting only forgets the installation in DevDock; uninstalling happens on GitHub (Manage link).
