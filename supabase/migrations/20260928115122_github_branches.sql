-- GitHub, phase 9c/9d (revised with the product owner):
--
--   * moving an issue to In Progress creates its branch (wa-2-add-login) on
--     GitHub, from the project's base branch (the `github` Edge Function,
--     action create_branch; recorded in issue_branches)
--   * draft PRs don't move issues any more
--   * a PR opened / ready for review → In Review
--   * closed without merging → back to In Progress (no other open PR)
--   * merged into one of the project's "done" branches → Done. Each project
--     picks them per linked repo (workspace_repos.done_branches, e.g. main,
--     prod, staging); none set = the repo's default branch.
--
-- Security:
--   * branch settings on a link: workspace managers (leads + group
--     owners/admins), like linking itself
--   * issue_branches: readable by workspace viewers; written only by the
--     Edge Function after it checks the caller can see the issue (RLS)

-- ---------------------------------------------------------------------------
-- Per-project branch settings on each linked repo
-- ---------------------------------------------------------------------------
-- Git ref rules, loosely: 1–255 characters, no spaces or ~^:?*[\ .
create function private.is_branch_name(name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select name ~ '^[^\s~^:?*\[\\]{1,255}$';
$$;

create function private.are_branch_names(names text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(private.is_branch_name(n)), true) from unnest(names) as n;
$$;

revoke all on function private.is_branch_name(text), private.are_branch_names(text[]) from public, anon, authenticated;
-- Check constraints run as the writer (leads update workspace_repos).
grant execute on function private.is_branch_name(text), private.are_branch_names(text[]) to authenticated;

alter table public.workspace_repos
  add column base_branch   text,
  add column done_branches text[] not null default '{}',
  add constraint workspace_repos_base_branch_format check (base_branch is null or private.is_branch_name(base_branch)),
  add constraint workspace_repos_done_branches_format check (
    cardinality(done_branches) <= 10 and private.are_branch_names(done_branches)
  );

comment on column public.workspace_repos.base_branch is 'Branch new issue branches start from; null = the repo''s default branch.';
comment on column public.workspace_repos.done_branches is 'Merging a PR into one of these marks its issues Done; empty = the repo''s default branch.';

grant update (base_branch, done_branches) on table public.workspace_repos to authenticated;

create policy "Workspace managers can edit repo links"
  on public.workspace_repos for update to authenticated
  using (private.can_manage_workspace(workspace_id))
  with check (private.can_manage_workspace(workspace_id));

-- ---------------------------------------------------------------------------
-- issue_branches: the branch DevDock created (or adopted) for an issue
-- ---------------------------------------------------------------------------
create table public.issue_branches (
  id           uuid primary key default gen_random_uuid(),
  issue_id     uuid not null,
  workspace_id uuid not null,
  repo_id      uuid not null references public.repos (id) on delete cascade,
  name         text not null,
  base         text not null,
  sha          text not null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint issue_branches_unique unique (issue_id, repo_id),
  constraint issue_branches_issue_fkey foreign key (issue_id, workspace_id)
    references public.issues (id, workspace_id) on delete cascade
);

comment on table public.issue_branches is 'Git branches created for issues (wa-2-add-login). Written only by the github Edge Function.';

create index issue_branches_workspace_idx on public.issue_branches (workspace_id);
create index issue_branches_repo_idx on public.issue_branches (repo_id);
create index issue_branches_created_by_idx on public.issue_branches (created_by);

revoke all on table public.issue_branches from anon, authenticated;
grant select on table public.issue_branches to authenticated;
alter table public.issue_branches enable row level security;

create policy "Workspace viewers can see issue branches"
  on public.issue_branches for select to authenticated
  using (private.can_view_workspace(workspace_id));

-- ---------------------------------------------------------------------------
-- Activity: branch created
-- ---------------------------------------------------------------------------
alter table public.issue_activity drop constraint issue_activity_kind;
alter table public.issue_activity add constraint issue_activity_kind check (kind in (
  'created', 'title', 'status', 'priority', 'assignee', 'parent', 'cycle',
  'estimate', 'due_date', 'label_added', 'label_removed', 'repo',
  'pr_linked', 'pr_merged', 'pr_closed', 'branch_created'
));

-- ---------------------------------------------------------------------------
-- New PR rules: drafts don't move issues; "done" = merged into a done branch
-- (the Edge Function decides that per project and passes p_merged_into_done)
-- ---------------------------------------------------------------------------
drop function public.github_apply_pull_request(uuid, uuid, bigint, integer, text, text, text, text, text, text, boolean);

create function public.github_apply_pull_request(
  p_issue_id         uuid,
  p_repo_id          uuid,
  p_github_pr_id     bigint,
  p_number           integer,
  p_title            text,
  p_url              text,
  p_state            text,
  p_head_ref         text,
  p_base_ref         text,
  p_author_login     text,
  p_merged_into_done boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  iss public.issues;
  prev_state text;
  other_open boolean;
  next_status public.issue_status;
begin
  if p_state not in ('draft', 'open', 'merged', 'closed') then
    raise exception 'Unknown PR state %', p_state using errcode = '22023';
  end if;

  select * into iss from public.issues i where i.id = p_issue_id for update;
  if not found then
    return null;
  end if;

  -- Everything this transaction logs is GitHub's doing.
  perform set_config('devdock.via', 'github', true);

  select pr.state into prev_state
  from public.issue_pull_requests pr
  where pr.issue_id = p_issue_id and pr.github_pr_id = p_github_pr_id;

  insert into public.issue_pull_requests as pr (
    issue_id, workspace_id, repo_id, github_pr_id, number, title, url, state,
    head_ref, base_ref, author_login, merged_at
  ) values (
    p_issue_id, iss.workspace_id, p_repo_id, p_github_pr_id, p_number, left(p_title, 500), p_url, p_state,
    p_head_ref, p_base_ref, p_author_login, case when p_state = 'merged' then now() end
  )
  on conflict (issue_id, github_pr_id) do update set
    number       = excluded.number,
    title        = excluded.title,
    url          = excluded.url,
    state        = excluded.state,
    head_ref     = excluded.head_ref,
    base_ref     = excluded.base_ref,
    author_login = excluded.author_login,
    merged_at    = case when excluded.state = 'merged' then coalesce(pr.merged_at, now()) end,
    updated_at   = now();

  if prev_state is null then
    insert into public.issue_activity (issue_id, workspace_id, kind, to_value, via)
    values (p_issue_id, iss.workspace_id, 'pr_linked', p_number::text, 'github');
  end if;
  if prev_state is distinct from p_state and p_state in ('merged', 'closed') then
    insert into public.issue_activity (issue_id, workspace_id, kind, to_value, via)
    values (p_issue_id, iss.workspace_id, case p_state when 'merged' then 'pr_merged' else 'pr_closed' end, p_number::text, 'github');
  end if;

  -- Only a change of PR state moves the issue (never edits or new pushes).
  if prev_state is not distinct from p_state then
    return null;
  end if;

  select exists (
    select 1 from public.issue_pull_requests pr
    where pr.issue_id = p_issue_id and pr.github_pr_id <> p_github_pr_id and pr.state in ('draft', 'open')
  ) into other_open;

  next_status := case
    when p_state = 'open' and iss.status in ('backlog', 'todo', 'in_progress') then 'in_review'
    when p_state = 'closed' and iss.status = 'in_review' and not other_open then 'in_progress'
    when p_state = 'merged' and p_merged_into_done and not other_open and iss.status <> 'done' then 'done'
  end::public.issue_status;

  if next_status is null or next_status = iss.status then
    return null;
  end if;
  update public.issues set status = next_status where id = p_issue_id;
  return next_status::text;
end;
$$;

revoke all on function public.github_apply_pull_request(uuid, uuid, bigint, integer, text, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.github_apply_pull_request(uuid, uuid, bigint, integer, text, text, text, text, text, text, boolean)
  to service_role;
