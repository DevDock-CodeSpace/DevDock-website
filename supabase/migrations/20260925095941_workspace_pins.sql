-- Pinned workspaces: each person pins courses/projects/workspaces to the top
-- of their sidebar. Pins are private: you only see and change your own, and
-- you can only pin a workspace you can see.

create table public.workspace_pins (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pinned_at    timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

comment on table public.workspace_pins is 'A workspace pinned to the top of one person''s sidebar.';

create index workspace_pins_workspace_idx on public.workspace_pins (workspace_id);

revoke all on table public.workspace_pins from anon, authenticated;
grant select, delete on table public.workspace_pins to authenticated;
grant insert (workspace_id) on table public.workspace_pins to authenticated;

alter table public.workspace_pins enable row level security;

create policy "People see their own pins"
  on public.workspace_pins for select to authenticated
  using (user_id = (select auth.uid()));

create policy "People pin workspaces they can see"
  on public.workspace_pins for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_view_workspace(workspace_id));

create policy "People unpin their own pins"
  on public.workspace_pins for delete to authenticated
  using (user_id = (select auth.uid()));
