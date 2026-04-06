-- Migration 009: Convert v_season_player_totals from materialized to regular view
--
-- Two fixes:
-- 1. Materialized view required manual REFRESH which anonymous users cannot do.
--    A regular view always reflects current data.
-- 2. The old query inner-joined competitions, so matches created without a
--    competition were excluded entirely. Changed to LEFT JOIN so all final
--    matches count regardless of whether they belong to a competition.

drop index if exists v_season_player_totals_player_idx;
drop index if exists v_season_player_totals_season_idx;
drop materialized view if exists v_season_player_totals;

create view v_season_player_totals as
select
  p.id              as player_id,
  p.first_name, p.last_name, p.position, p.team_id,
  c.season_id,
  m.competition_id,
  count(distinct r.match_id)                                            as matches_played,
  coalesce(sum(sp.goals), 0)                                            as total_goals,
  coalesce(sum(sp.shots_attempted), 0)                                  as total_shots,
  round(coalesce(sum(sp.goals),0)::numeric
    / nullif(sum(sp.shots_attempted),0) * 100, 1)                       as season_shot_efficiency,
  coalesce(sum(sp.goals_penalty), 0)                                    as total_goals_penalty,
  coalesce(sum(sp.shots_penalty), 0)                                    as total_shots_penalty,
  coalesce(sum(sp.goals_fast_break), 0)                                 as total_goals_fast_break,
  coalesce(sum(sp.shots_fast_break), 0)                                 as total_shots_fast_break,
  coalesce(sum(tp.total_turnovers), 0)                                  as total_turnovers,
  coalesce(sum(su.suspensions_2min), 0)                                 as total_suspensions_2min,
  coalesce(sum(su.yellow_cards), 0)                                     as total_yellow_cards,
  coalesce(sum(su.red_cards), 0)                                        as total_red_cards
from players p
join rosters r on r.player_id = p.id
join matches m on m.id = r.match_id and m.status = 'final'
left join competitions c on c.id = m.competition_id
left join v_shot_efficiency_by_player sp on sp.player_id = p.id and sp.match_id = m.id
left join v_turnovers_by_player tp on tp.player_id = p.id and tp.match_id = m.id
left join v_suspensions_by_player su on su.player_id = p.id and su.match_id = m.id
group by p.id, p.first_name, p.last_name, p.position, p.team_id, c.season_id, m.competition_id;

