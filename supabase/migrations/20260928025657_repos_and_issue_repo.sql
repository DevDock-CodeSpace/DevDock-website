-- Repositories (GitHub integration, phase 7a): no GitHub API yet.
--
-- A repo belongs to the group and can be linked to any number of its
-- projects (a shared api repo serves both the web and mobile projects).
-- Issues still belong to their workspace; an issue can point at one of the
-- repos linked to that workspace, like a label. Moving an issue "into" a repo
-- is just setting issues.repo_id, so its number and history never change.
--
-- Security:
--   * see repos: any group member (they're names and URLs)
--   * add / remove repos: group owners/admins
--   * see a workspace's links: whoever can see the workspace
--   * link / unlink repos on a workspace: its leads + group owners/admins
--   * set an issue's repo: anyone who can edit the issue, and only to a repo
--     linked to its workspace (check_issue)
-- Unlinking a repo from a workspace clears repo_id on that workspace's
-- issues; deleting the repo clears it everywhere.

-- ---------------------------------------------------------------------------
-- repos
-- ---------------------------------------------------------------------------
create table public.repos (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  -- github.com/<owner>/<name>
  owner      text not null,
  name       text not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  -- GitHub's rules: owners are letters, digits and single hyphens (≤ 39);
  -- repo names are letters, digits, ".", "-" and "_" (≤ 100), not "." or "..".
  constraint repos_owner_format check (owner ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'),
  constraint repos_name_format check (name ~ '^[A-Za-z0-9._-]{1,100}$' and name not in ('.', '..')),
  -- Lets workspace_repos reference (repo, team) so links can't cross groups.
  constraint repos_id_team_key unique (id, team_id)
);

comment on table public.repos is 'A GitHub repository used by a group; linked to projects through workspace_repos.';

-- GitHub names are case-insensitive: one row per repo per group.
create unique index repos_team_full_name_idx on public.repos (team_id, lower(owner), lower(name));
create index repos_created_by_idx on public.repos (created_by);

-- ---------------------------------------------------------------------------
-- workspace_repos: which projects use which repos
-- ---------------------------------------------------------------------------
create table public.workspace_repos (
  workspace_id uuid not null,
  repo_id      uuid not null,
  team_id      uuid not null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, repo_id),
  constraint workspace_repos_workspace_fkey foreign key (workspace_id, team_id)
    references public.workspaces (id, team_id) on delete cascade,
  constraint workspace_repos_repo_fkey foreign key (repo_id, team_id)
    references public.repos (id, team_id) on delete cascade
);

comment on table public.workspace_repos is 'A repo linked to a workspace (project). Both must be in the same group.';

create index workspace_repos_repo_idx on public.workspace_repos (repo_id);

-- Unlinked: that workspace's issues no longer point at the repo.
-- security definer so it reaches every issue in the workspace.
create function private.clear_unlinked_issue_repos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.issues i
  set repo_id = null
  where i.workspace_id = old.workspace_id and i.repo_id = old.repo_id;
  return null;
end;
$$;

create trigger clear_unlinked_issue_repos
  after delete on public.workspace_repos
  for each row execute function private.clear_unlinked_issue_repos();

-- ---------------------------------------------------------------------------
-- issues.repo_id
-- ---------------------------------------------------------------------------
alter table public.issues
  add column repo_id uuid references public.repos (id) on delete set null;

comment on column public.issues.repo_id is 'Optional repo the work happens in; must be linked to the issue''s workspace.';

create index issues_repo_idx on public.issues (repo_id);

grant insert (repo_id), update (repo_id) on table public.issues to authenticated;

-- Same rules as before, plus: the repo must be linked to the issue's workspace.
create or replace function private.check_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (
       select 1 from public.workspace_members m
       where m.workspace_id = new.workspace_id and m.user_id = new.assignee_id
     ) then
    raise exception 'The assignee must be a member of this workspace' using errcode = '23514';
  end if;

  if new.cycle_id is not null
     and (tg_op = 'INSERT' or new.cycle_id is distinct from old.cycle_id)
     and not exists (
       select 1 from public.issue_cycles c
       where c.id = new.cycle_id and c.workspace_id = new.workspace_id
     ) then
    raise exception 'The cycle must be in the same workspace' using errcode = '23514';
  end if;

  if new.repo_id is not null
     and (tg_op = 'INSERT' or new.repo_id is distinct from old.repo_id)
     and not exists (
       select 1 from public.workspace_repos r
       where r.repo_id = new.repo_id and r.workspace_id = new.workspace_id
     ) then
    raise exception 'The repository must be linked to this workspace' using errcode = '23514';
  end if;

  if new.parent_id is not null
     and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id) then
    if new.parent_id = new.id then
      raise exception 'An issue can''t be its own parent' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.issues p
      where p.id = new.parent_id and p.workspace_id = new.workspace_id
    ) then
      raise exception 'The parent issue must be in the same workspace' using errcode = '23514';
    end if;
    if exists (
      with recursive up as (
        select p.id, p.parent_id, 1 as depth from public.issues p where p.id = new.parent_id
        union all
        select p.id, p.parent_id, up.depth + 1
        from public.issues p join up on p.id = up.parent_id
        where up.depth < 100
      )
      select 1 from up where up.id = new.id
    ) then
      raise exception 'That would make an issue a sub-issue of itself' using errcode = '23514';
    end if;
  end if;

  if new.status in ('done', 'canceled') then
    if tg_op = 'INSERT' or old.status not in ('done', 'canceled') then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity: log repo changes too (to_value/from_value are repo ids)
-- ---------------------------------------------------------------------------
alter table public.issue_activity drop constraint issue_activity_kind;
alter table public.issue_activity add constraint issue_activity_kind check (kind in (
  'created', 'title', 'status', 'priority', 'assignee', 'parent', 'cycle',
  'estimate', 'due_date', 'label_added', 'label_removed', 'repo'
));

create or replace function private.log_issue_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.issue_activity (issue_id, workspace_id, actor_id, kind)
    values (new.id, new.workspace_id, actor, 'created');
    return null;
  end if;

  insert into public.issue_activity (issue_id, workspace_id, actor_id, kind, from_value, to_value)
  select new.id, new.workspace_id, actor, c.kind, c.old_value, c.new_value
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

revoke all on function
  private.clear_unlinked_issue_repos(),
  private.check_issue(),
  private.log_issue_activity()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on table public.repos, public.workspace_repos from anon, authenticated;

grant select, delete on table public.repos to authenticated;
grant insert (team_id, owner, name) on table public.repos to authenticated;

grant select, delete on table public.workspace_repos to authenticated;
grant insert (workspace_id, repo_id, team_id) on table public.workspace_repos to authenticated;

alter table public.repos enable row level security;
alter table public.workspace_repos enable row level security;

create policy "Group members can see repos"
  on public.repos for select to authenticated
  using (private.is_team_member(team_id));

create policy "Group owners and admins can add repos"
  on public.repos for insert to authenticated
  with check (private.is_team_admin(team_id));

create policy "Group owners and admins can remove repos"
  on public.repos for delete to authenticated
  using (private.is_team_admin(team_id));

create policy "Workspace viewers can see linked repos"
  on public.workspace_repos for select to authenticated
  using (private.can_view_workspace(workspace_id));

create policy "Workspace managers can link repos"
  on public.workspace_repos for insert to authenticated
  with check (private.can_manage_workspace(workspace_id));

create policy "Workspace managers can unlink repos"
  on public.workspace_repos for delete to authenticated
  using (private.can_manage_workspace(workspace_id));
