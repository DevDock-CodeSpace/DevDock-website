-- What a group can contain depends on its type:
--   learning     courses, projects and spaces (general)
--   development  projects and spaces only, no courses
--   general      anything
-- Enforced on both sides: a course can't be created in (or converted to) a
-- development group, and a group that still has courses can't become one.
-- (Existing data was checked first: no development group has a course.)

create function private.check_workspace_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'course'
     and (select t.type from public.teams t where t.id = new.team_id) = 'development' then
    raise exception 'Development groups can have projects and spaces, not courses' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_workspace_type
  before insert or update of type on public.workspaces
  for each row execute function private.check_workspace_type();

create function private.check_team_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type = 'development'
     and old.type is distinct from new.type
     and exists (select 1 from public.workspaces w where w.team_id = new.id and w.type = 'course') then
    raise exception 'This group has courses; change them to projects or spaces first' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_team_type
  before update of type on public.teams
  for each row execute function private.check_team_type();

revoke all on function private.check_workspace_type(), private.check_team_type() from public, anon, authenticated;
