-- Retire the "Resources" workspace tool: Docs (with folders) covers it.
--
-- Postgres can't drop an enum value without rebuilding the type and every
-- function that uses it, so 'resources' stays in public.workspace_module but
-- can no longer be enabled anywhere.

delete from public.workspace_modules where module = 'resources';

alter table public.workspace_modules
  add constraint workspace_modules_no_resources check (module <> 'resources');

comment on type public.workspace_module is
  'Workspace tools. ''resources'' is retired (Docs replaces it) and blocked by workspace_modules_no_resources.';

-- Same defaults as before, without Resources.
create or replace function public.default_workspace_modules(workspace_type public.workspace_type)
returns public.workspace_module[]
language sql
immutable
set search_path = ''
as $$
  select case workspace_type
    when 'project' then array['issues', 'docs', 'diagrams', 'github', 'live']::public.workspace_module[]
    when 'course'  then array['learning', 'docs', 'diagrams', 'exercises', 'live']::public.workspace_module[]
    else                array['docs', 'diagrams', 'live']::public.workspace_module[]
  end;
$$;
