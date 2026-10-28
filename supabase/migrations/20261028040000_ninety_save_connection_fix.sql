-- ninety-sync fix: ninety_save_connection updated the one ninety_config row without a WHERE clause,
-- which Supabase's API refuses (pg-safeupdate: "UPDATE requires a WHERE clause"), so connecting failed.

create or replace function public.ninety_save_connection(
  p_team uuid, p_token text, p_company_id text, p_owner_id text, p_owner_name text,
  p_app_url text, p_connected_by uuid, p_function_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  select c.token_secret_id into v_old from public.ninety_connections c where c.team_id = p_team;
  v_new := vault.create_secret(p_token, 'ninety_token_' || p_team || '_' || extract(epoch from now())::bigint, 'Ninety token for a DevDock group');
  insert into public.ninety_connections (team_id, token_secret_id, ninety_company_id, ninety_owner_id, ninety_owner_name, token_hint, app_url, connected_by)
  values (p_team, v_new, p_company_id, p_owner_id, p_owner_name, right(p_token, 4), p_app_url, p_connected_by)
  on conflict (team_id) do update set
    token_secret_id = excluded.token_secret_id, ninety_company_id = excluded.ninety_company_id,
    ninety_owner_id = excluded.ninety_owner_id, ninety_owner_name = excluded.ninety_owner_name,
    token_hint = excluded.token_hint, app_url = excluded.app_url, connected_by = excluded.connected_by,
    connected_at = now(), last_error = null, last_error_at = null;
  if v_old is not null then delete from vault.secrets where id = v_old; end if;
  update public.ninety_config set function_url = p_function_url where id;
end;
$$;
