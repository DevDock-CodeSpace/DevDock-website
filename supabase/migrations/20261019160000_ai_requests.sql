-- Ask DevDock: a record of what each person asked and what happened, so a wrong answer
-- (a reminder set for the wrong time) can be traced to the tool calls behind it.
--
-- Written only by the ai-agent Edge Function (service role), always pinned to the user id
-- it verified, like ai_pending_actions. A person can read their own rows and nothing else:
-- group owners and admins cannot (same rule as private reminders). Nobody can edit or
-- delete rows from the API. Kept until the person or their group is deleted (owner's
-- choice, 2026-10-19: no purge).

create table public.ai_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  request_id  uuid not null,
  message     text not null,
  -- The open page the assistant was told about, the user's time zone and the clock it used.
  page        text,
  time_zone   text,
  asked_at    timestamptz not null default now(),
  -- One entry per tool call: { tool, args, success, code, result (cut short) }.
  steps       jsonb not null default '[]',
  outcome     text not null,
  reply       text,
  ms          integer,
  constraint ai_requests_steps_array check (jsonb_typeof(steps) = 'array'),
  constraint ai_requests_steps_size check (pg_column_size(steps) <= 200000)
);

comment on table public.ai_requests is
  'Ask DevDock: what a person asked, the tool calls it made and its reply. Written only by the ai-agent Edge Function; readable only by the person who asked.';

create index ai_requests_user_idx on public.ai_requests (user_id, asked_at desc);
create index ai_requests_team_idx on public.ai_requests (team_id);

revoke all on table public.ai_requests from anon, authenticated;
grant select on table public.ai_requests to authenticated;
alter table public.ai_requests enable row level security;

create policy "People read their own Ask DevDock requests"
  on public.ai_requests for select to authenticated
  using (user_id = (select auth.uid()));
