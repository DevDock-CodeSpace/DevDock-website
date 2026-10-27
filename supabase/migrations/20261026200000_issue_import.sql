-- Importing issues from a file (CSV, or the CSV exports of Linear, Notion and Jira).
--
-- The browser reads the file, matches columns and values, and sends every row in
-- one call to public.import_issues(). It runs as the caller (security invoker), so
-- RLS, the column grants and the issue triggers (numbering, check_issue, activity)
-- apply to each row exactly as when an issue is created by hand. All rows go in or
-- none do.
--
-- Who: workspace leads and group owners/admins (owner's choice, 2026-10-26).
--
-- Re-running an import: each imported issue keeps where it came from
-- (import_source + import_ref, the row's id in the file). A row already imported
-- into the workspace is skipped, and still counts as a parent for the rows after it.

alter table public.issues
  add column import_source text,
  add column import_ref text,
  add constraint issues_import_source check (import_source is null or import_source in ('csv', 'linear', 'notion', 'jira')),
  add constraint issues_import_ref_length check (import_ref is null or char_length(import_ref) between 1 and 200),
  add constraint issues_import_pair check ((import_source is null) = (import_ref is null));

comment on column public.issues.import_source is 'Where an imported issue came from (csv, linear, notion, jira); null for issues made in DevDock.';
comment on column public.issues.import_ref is 'The issue''s id in the imported file, so importing it again skips it.';

create unique index issues_import_ref_key on public.issues (workspace_id, import_source, import_ref)
  where import_ref is not null;

grant insert (import_source, import_ref) on table public.issues to authenticated;

-- p_issues: an array, parents before their sub-issues, of
--   { ref, title, description?, status?, priority?, assignee_id?, estimate?, due_date?,
--     cycle_id?, labels?: [name], parent_ref? }
-- Labels are matched by name (ignoring case) and created when missing.
-- Returns { created, skipped, labels_created }.
create function public.import_issues(p_workspace_id uuid, p_source text, p_issues jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  label_name text;
  label uuid;
  new_id uuid;
  parent uuid;
  ids jsonb := '{}';          -- ref → issue id, for parent links
  created integer := 0;
  skipped integer := 0;
  labels_created integer := 0;
begin
  if not private.can_manage_workspace(p_workspace_id) then
    raise exception 'Only workspace leads and group owners/admins can import issues' using errcode = '42501';
  end if;
  if jsonb_typeof(p_issues) <> 'array' then
    raise exception 'Issues must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_issues) > 1000 then
    raise exception 'At most 1000 issues per import' using errcode = '22023';
  end if;

  -- Rows imported before: skipped, but sub-issues in this file can still point at them.
  select coalesce(jsonb_object_agg(i.import_ref, i.id), '{}') into ids
  from public.issues i
  where i.workspace_id = p_workspace_id
    and i.import_source = p_source
    and i.import_ref in (select x ->> 'ref' from jsonb_array_elements(p_issues) x);

  for item in select * from jsonb_array_elements(p_issues) loop
    if ids ? (item ->> 'ref') then
      skipped := skipped + 1;
      continue;
    end if;

    parent := (ids ->> (item ->> 'parent_ref'))::uuid;

    insert into public.issues (
      workspace_id, title, description, status, priority, assignee_id, parent_id,
      estimate, due_date, cycle_id, import_source, import_ref
    ) values (
      p_workspace_id,
      left(btrim(item ->> 'title'), 300),
      case when jsonb_typeof(item -> 'description') = 'object' then item -> 'description' end,
      coalesce((item ->> 'status')::public.issue_status, 'todo'),
      coalesce((item ->> 'priority')::smallint, 0),
      (item ->> 'assignee_id')::uuid,
      parent,
      (item ->> 'estimate')::smallint,
      (item ->> 'due_date')::date,
      (item ->> 'cycle_id')::uuid,
      p_source,
      item ->> 'ref'
    )
    returning id into new_id;

    ids := ids || jsonb_build_object(item ->> 'ref', new_id);
    created := created + 1;

    if jsonb_typeof(item -> 'labels') = 'array' then
      for label_name in select distinct left(btrim(x), 40) from jsonb_array_elements_text(item -> 'labels') x where btrim(x) <> '' loop
        select l.id into label from public.issue_labels l
        where l.workspace_id = p_workspace_id and lower(btrim(l.name)) = lower(label_name);
        if label is null then
          insert into public.issue_labels (workspace_id, name, color)
          values (p_workspace_id, label_name, 'default')
          returning id into label;
          labels_created := labels_created + 1;
        end if;
        insert into public.issue_label_links (issue_id, label_id, workspace_id)
        values (new_id, label, p_workspace_id)
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('created', created, 'skipped', skipped, 'labels_created', labels_created);
end;
$$;

revoke all on function public.import_issues(uuid, text, jsonb) from public, anon;
grant execute on function public.import_issues(uuid, text, jsonb) to authenticated;
