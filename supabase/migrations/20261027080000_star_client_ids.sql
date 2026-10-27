-- A new star carries the id its browser gave it, so the star shows at once under its real id and an
-- unstar clicked before the server answered deletes that row (the two requests run in order). A
-- chosen id can only collide (a unique violation); it reaches nobody else's rows, which RLS keeps
-- private.
grant insert (id) on table public.issue_pins to authenticated;
