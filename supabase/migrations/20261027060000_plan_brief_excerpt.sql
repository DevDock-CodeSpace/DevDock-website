-- The Plans list shows the first line of each plan's Brief under its name. A computed column
-- (`brief_excerpt`, selected with the plans list) gives the start of it in the same request,
-- without sending whole Briefs. Runs as the caller, so documents' RLS decides as for the doc itself.

create function public.brief_excerpt(p public.plans)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(d.content, '\s+', ' ', 'g')), 160), '')
  from public.documents d
  where d.id = p.brief_id;
$$;

revoke all on function public.brief_excerpt(public.plans) from public, anon;
grant execute on function public.brief_excerpt(public.plans) to authenticated;
