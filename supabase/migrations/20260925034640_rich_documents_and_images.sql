-- Rich documents (TipTap) and document images.
--
-- 1. documents.body: the rich content as TipTap/ProseMirror JSON. `content`
--    stays as a plain-text copy written alongside it (previews, future search).
--    Existing plain-text docs are converted to one paragraph per line.
-- 2. Storage bucket `doc-images` (private). Object path:
--      <team_id>/<document_id>/<file>
--    Access mirrors the document: whoever can read the doc can view its
--    images; whoever can edit the doc can upload/delete them.
--    No UPDATE policy: files are never overwritten (new upload = new name).
--    SVG is not allowed (it can carry scripts).

-- ---------------------------------------------------------------------------
-- 1. documents.body
-- ---------------------------------------------------------------------------
alter table public.documents
  add column body jsonb,
  add constraint documents_body_size check (body is null or octet_length(body::text) <= 2000000);

comment on column public.documents.body is
  'Rich content (TipTap/ProseMirror JSON). null = empty/legacy. `content` holds a plain-text copy.';

-- Backfill: each line of the old plain text becomes a paragraph.
update public.documents d
set body = jsonb_build_object(
  'type', 'doc',
  'content', (
    select jsonb_agg(
      case when t.line = '' then jsonb_build_object('type', 'paragraph')
      else jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', t.line))
      ) end
      order by t.n
    )
    from unnest(string_to_array(d.content, E'\n')) with ordinality as t(line, n)
  )
)
where d.content <> '' and d.body is null;

-- Writers already pass RLS for UPDATE; this just allows the new column.
grant update (body) on table public.documents to authenticated;

-- ---------------------------------------------------------------------------
-- 2. doc-images bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'doc-images', 'doc-images', false, 10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

-- Safe text → uuid (null for anything that isn't a uuid), so a malformed
-- object path fails the policy instead of raising a cast error.
create function private.to_uuid(value text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then value::uuid
  end;
$$;

-- Can the caller read (for_write = false) or edit (true) the document that
-- owns this object path? Both path segments must match the same document.
create function private.can_access_doc_image(object_name text, for_write boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.team_id = private.to_uuid((storage.foldername(object_name))[1])
      and d.id = private.to_uuid((storage.foldername(object_name))[2])
      and case
        when for_write then private.can_write_document(d.team_id, d.workspace_id)
        else private.can_read_document(d.team_id, d.workspace_id)
      end
  );
$$;

revoke all on function private.to_uuid(text) from public, anon, authenticated;
revoke all on function private.can_access_doc_image(text, boolean) from public, anon, authenticated;
grant execute on function private.to_uuid(text) to authenticated;
grant execute on function private.can_access_doc_image(text, boolean) to authenticated;

create policy "Doc readers can view doc images"
  on storage.objects for select to authenticated
  using (bucket_id = 'doc-images' and private.can_access_doc_image(name, false));

create policy "Doc editors can upload doc images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'doc-images' and private.can_access_doc_image(name, true));

create policy "Doc editors can delete doc images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'doc-images' and private.can_access_doc_image(name, true));
