-- ─── Migration 017: Close two privacy gaps ───────────────────────────────────
-- Changes ACCESS RULES ONLY. No table data is inserted, updated or deleted.
--
-- 1. Stats views (v_*) ran with their owner's rights, which bypasses row-level
--    security: any logged-in account could read every team's stats through
--    the REST API. With security_invoker = true a view runs with the CALLER's
--    rights, so it returns exactly the rows that caller could already read
--    from the underlying tables — your own matches and nothing else.
--    (The app itself no longer reads these views except v_match_summary,
--    which keeps returning the same rows for a team's owner.)
--
-- 2. court_lineups was readable and writable by every logged-in account.
--    It now uses the same ownership rule as events/rosters (migration 010):
--    you can only see and write lineups for matches your own team tracks.

-- ─── 1. Views respect the caller's row-level security ────────────────────────
-- Loops over every view in the public schema so none is missed, whatever
-- state earlier migrations left behind.
do $$
declare
  r record;
begin
  for r in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')   -- v = view, m = materialized view
      -- skip views installed by Postgres extensions (not ours to alter)
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
      )
  loop
    if r.relkind = 'v' then
      execute format('alter view public.%I set (security_invoker = true)', r.relname);
    else
      -- Materialized views can't be security_invoker; they store a snapshot of
      -- all teams. None is used by the app, so hide them from API roles.
      execute format('revoke all on public.%I from anon, authenticated', r.relname);
    end if;
  end loop;
end
$$;

-- ─── 2. court_lineups ownership ──────────────────────────────────────────────
drop policy if exists "Authenticated read all" on court_lineups;
drop policy if exists "Authenticated write court_lineups" on court_lineups;

create policy "court_lineups_all" on court_lineups
  for all to authenticated
  using (
    exists (
      select 1 from matches
      join teams on teams.id = matches.tracked_team_id
      where matches.id = court_lineups.match_id
        and (teams.owner_user_id = auth.uid() or teams.owner_user_id is null)
    )
  )
  with check (
    exists (
      select 1 from matches
      join teams on teams.id = matches.tracked_team_id
      where matches.id = court_lineups.match_id
        and (teams.owner_user_id = auth.uid() or teams.owner_user_id is null)
    )
  );
