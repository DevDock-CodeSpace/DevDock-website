-- Images in issue descriptions (screenshots).
--
-- They live in the existing private `doc-images` bucket (same size limit and
-- image types as docs), under their own prefix:
--
--   issues/<workspace_id>/<file>
--
-- Doc images use <team_id>/<document_id>/<file>, so the doc policies never
-- match these paths ("issues" is not a uuid) and these never match a doc.
--
-- Access mirrors issues: everyone who can see the workspace can view and
-- upload (any member creates and edits issues). An image can be deleted by
-- whoever uploaded it, or by a workspace manager (who deletes issues).

-- The workspace an issue-image path belongs to; null for any other path.
create function private.issue_image_workspace(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when array_length(storage.foldername(object_name), 1) = 2
     and (storage.foldername(object_name))[1] = 'issues'
    then private.to_uuid((storage.foldername(object_name))[2])
  end;
$$;

revoke all on function private.issue_image_workspace(text) from public, anon, authenticated;
grant execute on function private.issue_image_workspace(text) to authenticated;

create policy "Workspace viewers can view issue images"
  on storage.objects for select to authenticated
  using (bucket_id = 'doc-images' and private.can_view_workspace(private.issue_image_workspace(name)));

create policy "Workspace viewers can upload issue images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'doc-images' and private.can_view_workspace(private.issue_image_workspace(name)));

create policy "Uploaders and managers can delete issue images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'doc-images'
    and private.issue_image_workspace(name) is not null
    and (
      private.can_manage_workspace(private.issue_image_workspace(name))
      or (owner_id = (select auth.uid())::text and private.can_view_workspace(private.issue_image_workspace(name)))
    )
  );
