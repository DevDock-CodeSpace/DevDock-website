-- Live updates for pins and attachments (reactions and messages were already published).
do $$
declare
  t text;
begin
  foreach t in array array['message_pins', 'message_attachments'] loop
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
