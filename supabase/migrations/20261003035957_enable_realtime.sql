-- Live updates (like Linear): publish row changes so open tabs can refetch what
-- changed (src/lib/realtime.ts). The client only uses the table name of an event.
--
-- Realtime checks every INSERT/UPDATE against the subscriber's RLS policies and
-- column grants, so nobody receives a row they can't select. DELETE events can't
-- be checked that way; they carry only the primary key (default replica identity).
--
-- Left out on purpose: live_sessions (room_name must never reach the browser),
-- team_invites (codes), profiles, and the GitHub install/webhook tables.

do $$
declare
  t text;
begin
  foreach t in array array[
    'teams', 'team_members',
    'workspaces', 'workspace_members', 'workspace_modules', 'workspace_pins',
    'documents', 'doc_folders', 'diagrams',
    'issues', 'issue_labels', 'issue_label_links', 'issue_comments', 'issue_activity',
    'issue_cycles', 'issue_pull_requests', 'issue_branches',
    'repos', 'workspace_repos',
    'learning_modules', 'lessons', 'lesson_progress'
  ]
  loop
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
