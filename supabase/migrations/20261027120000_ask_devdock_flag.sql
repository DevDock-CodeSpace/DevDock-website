-- Ask DevDock (the AI assistant) becomes a feature flag (owner's choice, 2026-10-27): DevDock's special
-- feature, switched on per group by the platform admin, while everything else is part of every group.
--
-- Off by default, so a new group starts without it. Every group that exists today keeps it: each gets
-- its own "on" setting, which the admin can switch off in the console. The ai-agent function refuses a
-- group without the flag (it reads teams.enabled_features in the query it already makes), and the app
-- hides the button.

insert into public.feature_flags (key, description, default_enabled)
values ('ask_devdock', 'Ask DevDock: the AI assistant in the header (⌘K). It reads and changes things with the person''s own access.', false);

insert into public.team_feature_flags (team_id, flag, enabled)
select t.id, 'ask_devdock', true from public.teams t
on conflict (team_id, flag) do nothing;
