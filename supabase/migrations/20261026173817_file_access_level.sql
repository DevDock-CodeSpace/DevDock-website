-- The caller's level on one doc or whiteboard, as a computed column (`access_level`) the app selects
-- with the item, so its page offers editing only when the database would allow it. Without it, a
-- member someone shared a doc with as a viewer got an editable page whose saves were then refused.
-- Same scale as private.file_level(): 0 none, 1 view, 2 edit (shared as an editor), 3 the usual role rules.

create function public.access_level(d public.documents)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select private.file_level(d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by, 'doc', d.id);
$$;

create function public.access_level(d public.diagrams)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select private.file_level(d.team_id, d.workspace_id, d.folder_id, d.access, d.created_by, 'diagram', d.id);
$$;

revoke execute on function public.access_level(public.documents) from public, anon;
revoke execute on function public.access_level(public.diagrams) from public, anon;
grant execute on function public.access_level(public.documents) to authenticated;
grant execute on function public.access_level(public.diagrams) to authenticated;
