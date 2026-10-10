-- Per-group branding: an optional custom icon logo shown in the sidebar in place
-- of the DevDock mark. Owners and admins set it; everyone who can see the group
-- reads it. Stored in a PUBLIC bucket so the sidebar (on every page) builds the
-- URL for free and the browser caches it, with no per-page signed-URL request.

alter table public.teams add column logo_path text;

comment on column public.teams.logo_path is
  'Path in the public team-logos bucket (<team_id>/<uuid>.<ext>); null = the DevDock mark.';

-- Owners and admins already pass the teams UPDATE policy; allow the new column.
grant update (logo_path) on table public.teams to authenticated;

-- ---------------------------------------------------------------------------
-- team-logos bucket (public read via URL; writes gated by RLS below)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-logos', 'team-logos', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- The first path segment is the team id. private.to_uuid returns null for a
-- malformed path, and private.is_team_admin(null) is false, so both fail safely.
-- Public buckets serve reads without a policy; only writes are restricted here.
create policy "Team admins can upload a group logo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'team-logos'
    and private.is_team_admin(private.to_uuid((storage.foldername(name))[1]))
  );

create policy "Team admins can replace a group logo"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'team-logos'
    and private.is_team_admin(private.to_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'team-logos'
    and private.is_team_admin(private.to_uuid((storage.foldername(name))[1]))
  );

create policy "Team admins can delete a group logo"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'team-logos'
    and private.is_team_admin(private.to_uuid((storage.foldername(name))[1]))
  );
