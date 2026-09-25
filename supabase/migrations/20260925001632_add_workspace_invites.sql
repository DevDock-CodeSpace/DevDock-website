-- Onboarding: join a workspace with an invite code.
--
-- Onboarding flow this supports (together with the previous migration):
--   * A signed-in user with no workspace_members rows has no workspaces yet;
--     the app shows onboarding.
--   * Create: INSERT into workspaces → the creator becomes owner (existing trigger).
--   * Join:   rpc('join_workspace', { invite_code }) → the caller becomes a
--     *member* (never admin/owner). Workspace membership grants no course
--     access; course_members is still managed separately.
--   * Either path works again later, so users can belong to many workspaces,
--     with a different role in each.
--
-- Invites are created and revoked (deleted) by the workspace's owner/admins.
-- Invitees never read the invites table; they only call join_workspace.

-- ---------------------------------------------------------------------------
-- Code generator: 12 random hex characters (48 bits), formatted XXXX-XXXX-XXXX.
-- Taken from gen_random_uuid(); the first 12 hex digits of a v4 UUID are all
-- random (the version nibble comes later). 2^48 codes makes guessing
-- impractical.
-- ---------------------------------------------------------------------------
create function private.generate_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4))
  from (select replace(gen_random_uuid()::text, '-', '') as h) as random_hex;
$$;

-- Needed at INSERT time by the column default below.
revoke execute on function private.generate_invite_code() from public, anon;
grant execute on function private.generate_invite_code() to authenticated;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- Always generated server-side: clients have no INSERT privilege on it.
  code         text not null default private.generate_invite_code(),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Optional limits. null = no expiry / unlimited uses.
  expires_at   timestamptz,
  max_uses     integer,
  use_count    integer not null default 0,

  constraint workspace_invites_code_key unique (code),
  constraint workspace_invites_code_format check (code ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),
  constraint workspace_invites_max_uses_positive check (max_uses is null or max_uses > 0),
  constraint workspace_invites_use_count_valid
    check (use_count >= 0 and (max_uses is null or use_count <= max_uses)),
  constraint workspace_invites_expiry_after_creation check (expires_at is null or expires_at > created_at)
);

comment on table public.workspace_invites is
  'Invite codes for joining a workspace as a member. Redeemed only via public.join_workspace().';

create index workspace_invites_workspace_id_idx on public.workspace_invites (workspace_id);

-- ---------------------------------------------------------------------------
-- Privileges + RLS: only the workspace's owner/admins see, create, and revoke
-- invites. No UPDATE at all: use_count changes only inside join_workspace().
-- ---------------------------------------------------------------------------
revoke all on table public.workspace_invites from anon, authenticated;
grant select, delete on table public.workspace_invites to authenticated;
grant insert (workspace_id, expires_at, max_uses) on table public.workspace_invites to authenticated;

alter table public.workspace_invites enable row level security;

create policy "Owners and admins can view invites"
  on public.workspace_invites for select to authenticated
  using (private.is_workspace_admin(workspace_id));

create policy "Owners and admins can create invites"
  on public.workspace_invites for insert to authenticated
  with check (private.is_workspace_admin(workspace_id) and created_by = (select auth.uid()));

create policy "Owners and admins can revoke invites"
  on public.workspace_invites for delete to authenticated
  using (private.is_workspace_admin(workspace_id));

-- ---------------------------------------------------------------------------
-- Redeem an invite. The only way to add yourself to a workspace.
--
-- * Accepts the code in any case, with or without dashes/spaces.
-- * Always joins as 'member'.
-- * Already a member: returns the workspace id and does not use up the invite.
-- * Every failure (unknown, expired, used up) raises the same 'invalid_invite'
--   error, so callers can't probe which codes exist.
-- * Locks the invite row so concurrent redemptions can't exceed max_uses.
--
-- Lives in public on purpose: it is the RPC the app calls.
-- ---------------------------------------------------------------------------
create function public.join_workspace(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  digits text := upper(regexp_replace(coalesce(invite_code, ''), '[^0-9A-Za-z]', '', 'g'));
  invite public.workspace_invites%rowtype;
begin
  if caller is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if char_length(digits) = 12 then
    select * into invite
    from public.workspace_invites i
    where i.code = substr(digits, 1, 4) || '-' || substr(digits, 5, 4) || '-' || substr(digits, 9, 4)
    for update;
  end if;

  if invite.id is null
     or (invite.expires_at is not null and invite.expires_at <= now())
     or (invite.max_uses is not null and invite.use_count >= invite.max_uses)
  then
    raise exception 'invalid_invite'
      using errcode = 'P0001',
            hint = 'The invite code is invalid, expired, or has no uses left.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (invite.workspace_id, caller, 'member')
  on conflict (workspace_id, user_id) do nothing;

  if found then
    update public.workspace_invites
    set use_count = use_count + 1
    where id = invite.id;
  end if;

  return invite.workspace_id;
end;
$$;

comment on function public.join_workspace(text) is
  'Join a workspace as a member using an invite code. Returns the workspace id.';

revoke execute on function public.join_workspace(text) from public, anon;
grant execute on function public.join_workspace(text) to authenticated;
