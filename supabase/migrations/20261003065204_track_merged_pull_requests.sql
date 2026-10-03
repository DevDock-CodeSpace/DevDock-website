-- Track a merged pull request until its work reaches a done branch.
--
-- With a feature → dev → main flow, an issue's own PR merges into dev, which is
-- not a done branch, so the issue used to stay In Review forever. Now each
-- merged PR remembers the branch its work has reached (landed_ref). When that
-- branch is itself merged onwards by another PR (dev → main), the webhook
-- calls github_promote_merged(): the PRs move along, and if the new branch is
-- one of the project's done branches their issues become Done.

alter table public.issue_pull_requests add column landed_ref text;

comment on column public.issue_pull_requests.landed_ref is
  'For merged PRs: the branch the work has reached so far (base_ref at first, then wherever that branch was merged). Null until merged.';

update public.issue_pull_requests set landed_ref = base_ref where state = 'merged';

-- ---------------------------------------------------------------------------
-- github_apply_pull_request: same rules, and a merge now records landed_ref
-- ---------------------------------------------------------------------------
create or replace function public.github_apply_pull_request(
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
    head_ref, base_ref, author_login, merged_at, landed_ref
  ) values (
    p_issue_id, iss.workspace_id, p_repo_id, p_github_pr_id, p_number, left(p_title, 500), p_url, p_state,
    p_head_ref, p_base_ref, p_author_login, case when p_state = 'merged' then now() end,
    case when p_state = 'merged' then p_base_ref end
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
    -- Keep where it has got to since (a later "edited" event must not send it back).
    landed_ref   = case when excluded.state = 'merged' then coalesce(pr.landed_ref, excluded.base_ref) end,
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

-- ---------------------------------------------------------------------------
-- github_promote_merged: branch p_from_ref was merged into p_to_ref
-- ---------------------------------------------------------------------------
-- Called by the github-webhook Edge Function (service role) once per project
-- linked to the repo. Moves that project's merged PRs that had reached
-- p_from_ref on to p_to_ref. When p_to_ref is a done branch of the project
-- (the function decides and passes p_into_done), their issues become Done,
-- except:
--   * issues already done or canceled;
--   * issues with another PR still open;
--   * issues whose status a person changed after the PR was merged (a manual
--     change wins, as with every other GitHub rule).
-- Returns the numbers of the issues it moved to Done.
create function public.github_promote_merged(
  p_repo_id      uuid,
  p_workspace_id uuid,
  p_from_ref     text,
  p_to_ref       text,
  p_into_done    boolean
)
returns integer[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  carried record;
  iss public.issues;
  moved integer[] := '{}';
begin
  if p_from_ref = p_to_ref then
    return moved;
  end if;

  -- Everything this transaction logs is GitHub's doing.
  perform set_config('devdock.via', 'github', true);

  for carried in
    with promoted as (
      update public.issue_pull_requests pr
      set landed_ref = p_to_ref
      where pr.repo_id = p_repo_id
        and pr.workspace_id = p_workspace_id
        and pr.state = 'merged'
        and pr.landed_ref = p_from_ref
      returning pr.issue_id, pr.merged_at
    )
    select p.issue_id, max(p.merged_at) as merged_at from promoted p group by p.issue_id
  loop
    continue when not p_into_done;

    select * into iss from public.issues i where i.id = carried.issue_id for update;
    continue when not found or iss.status in ('done', 'canceled');

    continue when exists (
      select 1 from public.issue_pull_requests pr
      where pr.issue_id = iss.id and pr.state in ('draft', 'open')
    );
    continue when exists (
      select 1 from public.issue_activity a
      where a.issue_id = iss.id and a.kind = 'status' and a.via is null and a.created_at > carried.merged_at
    );

    update public.issues set status = 'done' where id = iss.id;
    moved := moved || iss.number;
  end loop;

  return moved;
end;
$$;

revoke all on function public.github_promote_merged(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.github_promote_merged(uuid, uuid, text, text, boolean) to service_role;
