-- Ask DevDock (the ai-agent Edge Function): actions waiting for the person's
-- confirmation.
--
-- When the assistant wants to do something that reaches another person (send a
-- message) or can't be undone, the function checks the arguments, stores them
-- here and shows the person a preview. Confirming sends back only this row's
-- id; the function then runs the stored tool with the stored arguments, once.
--
-- Service role only, like github_webhook_deliveries: RLS is on and there are
-- no policies and no grants for anon or authenticated. That is the point of
-- the table. If a browser could insert a row it could write any tool call it
-- liked and then "confirm" it, so only the function writes here, always pinned
-- to the user id it verified. The action itself still runs as that user, under
-- their RLS.
--
-- The table stays small without a job: preparing an action deletes the same
-- person's executed and expired ones.

create table public.ai_pending_actions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  tool_name    text not null,
  args         jsonb not null,
  expires_at   timestamptz not null,
  executed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint ai_pending_actions_tool_name check (tool_name ~ '^[a-z][a-z0-9_]{1,62}$'),
  constraint ai_pending_actions_args_object check (jsonb_typeof(args) = 'object'),
  -- Tool arguments are short; this is a backstop against storing something huge.
  constraint ai_pending_actions_args_size check (pg_column_size(args) <= 32768)
);

comment on table public.ai_pending_actions is
  'Ask DevDock: a checked tool call waiting for its owner to confirm it. Written only by the ai-agent Edge Function (service role).';
comment on column public.ai_pending_actions.executed_at is
  'Set when the action is claimed for execution. Claiming is one UPDATE … WHERE executed_at IS NULL, so it happens once.';

-- The function reads and cleans up by owner.
create index ai_pending_actions_user_idx on public.ai_pending_actions (user_id, expires_at);

revoke all on table public.ai_pending_actions from anon, authenticated;
alter table public.ai_pending_actions enable row level security;
