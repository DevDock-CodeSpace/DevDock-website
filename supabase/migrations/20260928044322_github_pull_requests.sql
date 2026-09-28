-- GitHub, phase 9c: pull requests move issues.
--
-- The github-webhook Edge Function receives GitHub's pull_request events
-- (signature-checked), finds the issues a PR mentions (CAP-12 in its branch
-- or title, or "fixes CAP-12" in its description) in projects linked to that
-- repo, and calls github_apply_pull_request() for each. That records the PR
-- on the issue and moves the issue:
--   * draft PR opened            backlog/todo            → in_progress
--   * PR opened / ready          backlog/todo/in_progress → in_review
--   * back to draft              in_review               → in_progress (no other open PR)
--   * closed without merging     in_review               → in_progress (no other open PR)
--   * merged into the default branch, no other open PR    → done
-- Only a *change* in the PR's state moves an issue, so edits and new pushes
-- never override a status someone set by hand. Canceled and done issues are
-- only ever moved by a merge (to done).
--
-- Activity rows written this way have via = 'github' (and no actor).
--
-- Security: clients read PRs of issues they can see and write nothing. Only
-- the service role (the Edge Function) calls github_apply_pull_request.

-- ---------------------------------------------------------------------------
-- issue_pull_requests
-- ---------------------------------------------------------------------------
create table public.issue_pull_requests (
  id            uuid primary key default gen_random_uuid(),
  issue_id      uuid not null,
  workspace_id  uuid not null,
  repo_id       uuid not null references public.repos (id) on delete cascade,
  github_pr_id  bigint not null,
  number        integer not null,
  title         text not null,
  url           text not null,
  state         text not null,
  head_ref      text not null,
  base_ref      text not null,
  author_login  text,
  merged_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint issue_pull_requests_state check (state in ('draft', 'open', 'merged', 'closed')),
  constraint issue_pull_requests_unique unique (issue_id, github_pr_id),
  constraint issue_pull_requests_issue_fkey foreign key (issue_id, workspace_id)
    references public.issues (id, workspace_id) on delete cascade
);

comment on table public.issue_pull_requests is 'GitHub pull requests that mention an issue. Written only by the github-webhook Edge Function.';

create index issue_pull_requests_issue_idx on public.issue_pull_requests (issue_id);
create index issue_pull_requests_workspace_idx on public.issue_pull_requests (workspace_id);
create index issue_pull_requests_repo_idx on public.issue_pull_requests (repo_id);

-- ---------------------------------------------------------------------------
-- Webhook deliveries seen (GitHub retries; each delivery is handled once)
-- ---------------------------------------------------------------------------
create table public.github_webhook_deliveries (
  delivery_id text primary key,
  event       text not null,
  received_at timestamptz not null default now()
);

comment on table public.github_webhook_deliveries is 'GitHub webhook delivery ids already handled. Service role only.';

create index github_webhook_deliveries_received_idx on public.github_webhook_deliveries (received_at);

revoke all on table public.github_webhook_deliveries from anon, authenticated;
alter table public.github_webhook_deliveries enable row level security;

-- ---------------------------------------------------------------------------
-- Activity: "via GitHub", and PR events
-- ---------------------------------------------------------------------------
alter table public.issue_activity
  add column via text,
  add constraint issue_activity_via check (via is null or via = 'github');

comment on column public.issue_activity.via is 'Who made the change when it wasn''t a person: ''github'' for webhook-driven changes.';

alter table public.issue_activity drop constraint issue_activity_kind;
alter table public.issue_activity add constraint issue_activity_kind check (kind in (
  'created', 'title', 'status', 'priority', 'assignee', 'parent', 'cycle',
  'estimate', 'due_date', 'label_added', 'label_removed', 'repo',
  'pr_linked', 'pr_merged', 'pr_closed'
));

-- Same as before, plus `via` from the transaction setting devdock.via
-- (set only by github_apply_pull_request).
create or replace function private.log_issue_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  source text := nullif(current_setting('devdock.via', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.issue_activity (issue_id, workspace_id, actor_id, kind, via)
    values (new.id, new.workspace_id, actor, 'created', source);
    return null;
  end if;

  insert into public.issue_activity (issue_id, workspace_id, actor_id, kind, from_value, to_value, via)
  select new.id, new.workspace_id, actor, c.kind, c.old_value, c.new_value, source
  from (values
    ('title',    old.title,              new.title),
    ('status',   old.status::text,       new.status::text),
    ('priority', old.priority::text,     new.priority::text),
    ('assignee', old.assignee_id::text,  new.assignee_id::text),
    ('parent',   old.parent_id::text,    new.parent_id::text),
    ('cycle',    old.cycle_id::text,     new.cycle_id::text),
    ('estimate', old.estimate::text,     new.estimate::text),
    ('due_date', old.due_date::text,     new.due_date::text),
    ('repo',     old.repo_id::text,      new.repo_id::text)
  ) as c(kind, old_value, new_value)
  where c.old_value is distinct from c.new_value;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a PR on an issue and move the issue (service role only)
-- ---------------------------------------------------------------------------
create function public.github_apply_pull_request(
  p_issue_id            uuid,
  p_repo_id             uuid,
  p_github_pr_id        bigint,
  p_number              integer,
  p_title               text,
  p_url                 text,
  p_state               text,
  p_head_ref            text,
  p_base_ref            text,
  p_author_login        text,
  p_merged_into_default boolean
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

  -- Only a change of PR state moves the issue.
  if prev_state is not distinct from p_state then
    return null;
  end if;

  select exists (
    select 1 from public.issue_pull_requests pr
    where pr.issue_id = p_issue_id and pr.github_pr_id <> p_github_pr_id and pr.state in ('draft', 'open')
  ) into other_open;

  next_status := case
    when p_state = 'open' and iss.status in ('backlog', 'todo', 'in_progress') then 'in_review'
    when p_state = 'draft' and iss.status in ('backlog', 'todo') then 'in_progress'
    when p_state = 'draft' and iss.status = 'in_review' and not other_open then 'in_progress'
    when p_state = 'closed' and iss.status = 'in_review' and not other_open then 'in_progress'
    when p_state = 'merged' and p_merged_into_default and not other_open and iss.status <> 'done' then 'done'
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

revoke all on function private.log_issue_activity() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.issue_pull_requests from anon, authenticated;
grant select on table public.issue_pull_requests to authenticated;

alter table public.issue_pull_requests enable row level security;

create policy "Workspace viewers can see pull requests"
  on public.issue_pull_requests for select to authenticated
  using (private.can_view_workspace(workspace_id));
