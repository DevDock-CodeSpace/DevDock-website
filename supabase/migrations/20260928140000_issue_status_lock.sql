-- GitHub, phase 9c/9d: In Review and Done come from GitHub (agreed with the
-- product owner, for teaching: students finish work through a real PR).
--
-- For an issue whose repo is connected to GitHub, only these can set
-- In Review or Done:
--   * GitHub (github_apply_pull_request sets devdock.via = 'github')
--   * workspace managers (leads + group owners/admins), as an override
-- Everyone else can still use Backlog, Todo, In Progress and Canceled, and move
-- issues back (e.g. Done → In Progress to reopen). Issues without a repo, or
-- with a repo that isn't connected, aren't affected.
--
-- Errors use SQLSTATE DD001 so the app can explain it.

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

  -- In Review / Done on a connected repo: GitHub or a workspace manager only.
  if new.status in ('in_review', 'done')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and new.repo_id is not null
     and coalesce(current_setting('devdock.via', true), '') <> 'github'
     and exists (select 1 from public.repos r where r.id = new.repo_id and r.installation_id is not null)
     and not private.can_manage_workspace(new.workspace_id) then
    raise exception 'In Review and Done are set by GitHub for this issue' using errcode = 'DD001';
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

revoke all on function private.check_issue() from public, anon, authenticated;
