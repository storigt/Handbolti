-- ─── Base filter ─────────────────────────────────────────────────────────────
-- All views apply: WHERE is_voided = false AND is_edited = false
-- This ensures voided/corrected events are excluded from all stats automatically.

-- ─── v_shots ─────────────────────────────────────────────────────────────────
-- Filtered SHOT events with convenience boolean flags
create or replace view v_shots as
select
  e.id,
  e.match_id,
  e.period,
  e.match_clock,
  e.wall_clock,
  e.team_id,
  e.player_id,
  e.sub_type,
  e.situation,
  e.zone,
  e.context,
  (e.sub_type = 'goal')                              as is_goal,
  (e.sub_type in ('goal', 'saved'))                  as is_on_target,
  (e.situation = '7m_penalty')                       as is_7m,
  (e.situation = 'fast_break')                       as is_fast_break,
  (e.situation = 'counter_attack')                   as is_counter_attack
from events e
where
  e.event_type = 'SHOT'
  and e.is_voided = false
  and e.is_edited = false;

-- ─── v_shot_efficiency_by_player ─────────────────────────────────────────────
-- Per player per match shooting stats
create or replace view v_shot_efficiency_by_player as
select
  s.player_id,
  s.match_id,
  s.team_id,
  count(*)                                           as shots_attempted,
  count(*) filter (where s.is_on_target)             as shots_on_target,
  count(*) filter (where s.is_goal)                  as goals,
  round(
    count(*) filter (where s.is_goal)::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                  as shot_efficiency,
  round(
    count(*) filter (where s.is_on_target)::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                  as on_target_pct
from v_shots s
where s.player_id is not null
group by s.player_id, s.match_id, s.team_id;

-- ─── v_shot_efficiency_by_zone ────────────────────────────────────────────────
-- Per zone per situation — used for shot heatmap
create or replace view v_shot_efficiency_by_zone as
select
  s.match_id,
  s.team_id,
  s.zone,
  s.situation,
  count(*)                                           as shots_attempted,
  count(*) filter (where s.is_goal)                  as goals,
  round(
    count(*) filter (where s.is_goal)::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                  as efficiency
from v_shots s
group by s.match_id, s.team_id, s.zone, s.situation;

-- ─── v_goalkeeper_performance ─────────────────────────────────────────────────
-- Goalkeeper saves/conceded per match, joined through event_links to shots
create or replace view v_goalkeeper_performance as
select
  gk.player_id                                       as goalkeeper_player_id,
  gk.match_id,
  gk.team_id,
  count(*)                                           as shots_faced,
  count(*) filter (where gk.sub_type = 'save')       as saves,
  count(*) filter (where gk.sub_type = 'goal_conceded') as goals_conceded,
  round(
    count(*) filter (where gk.sub_type = 'save')::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                  as save_pct
from events gk
where
  gk.event_type = 'GOALKEEPER_ACTION'
  and gk.sub_type in ('save', 'goal_conceded')
  and gk.is_voided = false
  and gk.is_edited = false
group by gk.player_id, gk.match_id, gk.team_id;

-- ─── v_goalkeeper_save_pct_by_zone ────────────────────────────────────────────
-- Goalkeeper performance broken out by shot zone
-- Uses event_links to get the zone from the linked SHOT event
create or replace view v_goalkeeper_save_pct_by_zone as
select
  gk.player_id                                       as goalkeeper_player_id,
  gk.match_id,
  s.zone,
  count(*)                                           as shots_faced,
  count(*) filter (where gk.sub_type = 'save')       as saves,
  round(
    count(*) filter (where gk.sub_type = 'save')::numeric
    / nullif(count(*), 0) * 100, 1
  )                                                  as save_pct
from events gk
join event_links el
  on el.linked_event_id = gk.id
  and el.link_type = 'goalkeeper_response'
join events s
  on s.id = el.primary_event_id
  and s.event_type = 'SHOT'
  and s.is_voided = false
  and s.is_edited = false
where
  gk.event_type = 'GOALKEEPER_ACTION'
  and gk.sub_type in ('save', 'goal_conceded')
  and gk.is_voided = false
  and gk.is_edited = false
  and s.zone is not null
group by gk.player_id, gk.match_id, s.zone;

-- ─── v_turnovers_by_player ───────────────────────────────────────────────────
create or replace view v_turnovers_by_player as
select
  e.player_id,
  e.match_id,
  e.team_id,
  count(*)                                           as total_turnovers,
  count(*) filter (where e.sub_type = 'bad_pass')    as bad_passes,
  count(*) filter (where e.sub_type = 'lost_dribble') as lost_dribbles,
  count(*) filter (where e.sub_type = 'offensive_foul') as offensive_fouls,
  count(*) filter (where e.sub_type = 'stepped')     as stepped,
  count(*) filter (where e.sub_type = 'double_dribble') as double_dribbles,
  count(*) filter (where e.sub_type = 'out_of_bounds') as out_of_bounds,
  count(*) filter (where e.sub_type = 'shot_clock')  as shot_clock_violations,
  count(*) filter (where e.sub_type = 'other')       as other_turnovers
from events e
where
  e.event_type = 'TURNOVER'
  and e.is_voided = false
  and e.is_edited = false
group by e.player_id, e.match_id, e.team_id;

-- ─── v_turnover_rate ─────────────────────────────────────────────────────────
-- Approximate turnover rate: turnovers / (shots + turnovers)
create or replace view v_turnover_rate as
select
  coalesce(t.player_id, s.player_id)                 as player_id,
  coalesce(t.match_id, s.match_id)                   as match_id,
  coalesce(t.team_id, s.team_id)                     as team_id,
  coalesce(t.total_turnovers, 0)                     as turnovers,
  coalesce(s.shots_attempted, 0)                     as shots_attempted,
  coalesce(t.total_turnovers, 0)
    + coalesce(s.shots_attempted, 0)                 as possession_approx,
  round(
    coalesce(t.total_turnovers, 0)::numeric
    / nullif(
        coalesce(t.total_turnovers, 0) + coalesce(s.shots_attempted, 0),
        0
      ) * 100, 1
  )                                                  as turnover_rate
from v_turnovers_by_player t
full outer join v_shot_efficiency_by_player s
  on t.player_id = s.player_id and t.match_id = s.match_id;

-- ─── v_fast_break_efficiency ─────────────────────────────────────────────────
create or replace view v_fast_break_efficiency as
select
  s.team_id,
  s.match_id,
  count(*)                               as fast_break_attempts,
  count(*) filter (where s.is_goal)      as fast_break_goals,
  round(
    count(*) filter (where s.is_goal)::numeric
    / nullif(count(*), 0) * 100, 1
  )                                      as fast_break_efficiency
from v_shots s
where s.is_fast_break = true
group by s.team_id, s.match_id;

-- ─── v_7m_efficiency ─────────────────────────────────────────────────────────
create or replace view v_7m_efficiency as
select
  s.player_id,
  s.match_id,
  s.team_id,
  count(*)                               as attempts_7m,
  count(*) filter (where s.is_goal)      as goals_7m,
  round(
    count(*) filter (where s.is_goal)::numeric
    / nullif(count(*), 0) * 100, 1
  )                                      as efficiency_7m
from v_shots s
where s.is_7m = true and s.player_id is not null
group by s.player_id, s.match_id, s.team_id;

-- ─── v_suspensions_by_player ─────────────────────────────────────────────────
create or replace view v_suspensions_by_player as
select
  e.player_id,
  e.match_id,
  e.team_id,
  count(*) filter (where e.sub_type = '2min')            as suspensions_2min,
  count(*) filter (where e.sub_type = '2min') * 2        as minutes_suspended,
  count(*) filter (where e.sub_type = 'yellow_card')     as yellow_cards,
  count(*) filter (where e.sub_type = 'red_card')        as red_cards,
  count(*) filter (where e.sub_type = 'blue_card')       as blue_cards,
  count(*) filter (where e.sub_type = 'disqualification') as disqualifications
from events e
where
  e.event_type = 'SUSPENSION'
  and e.is_voided = false
  and e.is_edited = false
group by e.player_id, e.match_id, e.team_id;

-- ─── v_match_summary ─────────────────────────────────────────────────────────
-- Per match per team aggregated stats — used for postgame report
create or replace view v_match_summary as
select
  m.id                                               as match_id,
  m.match_date,
  m.home_team_id,
  m.away_team_id,
  m.status,
  t.id                                               as team_id,
  t.name                                             as team_name,
  -- goals and shots
  coalesce(shots.total_goals, 0)                     as goals,
  coalesce(shots.total_shots, 0)                     as shots_attempted,
  shots.shot_efficiency,
  -- fast break
  coalesce(fb.fast_break_goals, 0)                   as fast_break_goals,
  coalesce(fb.fast_break_attempts, 0)                as fast_break_attempts,
  fb.fast_break_efficiency,
  -- turnovers
  coalesce(tv.total_turnovers, 0)                    as total_turnovers,
  -- suspensions
  coalesce(susp.total_2min, 0)                       as suspensions_2min
from matches m
cross join teams t
left join (
  select
    match_id,
    team_id,
    sum(goals)             as total_goals,
    sum(shots_attempted)   as total_shots,
    round(sum(goals)::numeric / nullif(sum(shots_attempted), 0) * 100, 1) as shot_efficiency
  from v_shot_efficiency_by_player
  group by match_id, team_id
) shots on shots.match_id = m.id and shots.team_id = t.id
left join v_fast_break_efficiency fb
  on fb.match_id = m.id and fb.team_id = t.id
left join (
  select match_id, team_id, sum(total_turnovers) as total_turnovers
  from v_turnovers_by_player
  group by match_id, team_id
) tv on tv.match_id = m.id and tv.team_id = t.id
left join (
  select match_id, team_id, sum(suspensions_2min) as total_2min
  from v_suspensions_by_player
  group by match_id, team_id
) susp on susp.match_id = m.id and susp.team_id = t.id
where t.id in (m.home_team_id, m.away_team_id);

-- ─── v_season_player_totals (materialized) ────────────────────────────────────
-- Season-wide aggregated player stats — refresh after each match finalization
create materialized view v_season_player_totals as
select
  p.id                                               as player_id,
  p.first_name,
  p.last_name,
  p.position,
  p.team_id,
  c.season_id,
  m.competition_id,
  count(distinct r.match_id)                         as matches_played,
  coalesce(sum(sp.goals), 0)                         as total_goals,
  coalesce(sum(sp.shots_attempted), 0)               as total_shots,
  round(
    coalesce(sum(sp.goals), 0)::numeric
    / nullif(sum(sp.shots_attempted), 0) * 100, 1
  )                                                  as season_shot_efficiency,
  coalesce(sum(tp.total_turnovers), 0)               as total_turnovers,
  coalesce(sum(su.suspensions_2min), 0)              as total_suspensions_2min,
  coalesce(sum(su.yellow_cards), 0)                  as total_yellow_cards,
  coalesce(sum(su.red_cards), 0)                     as total_red_cards
from players p
join rosters r on r.player_id = p.id
join matches m on m.id = r.match_id and m.status = 'final'
join competitions c on c.id = m.competition_id
left join v_shot_efficiency_by_player sp
  on sp.player_id = p.id and sp.match_id = m.id
left join v_turnovers_by_player tp
  on tp.player_id = p.id and tp.match_id = m.id
left join v_suspensions_by_player su
  on su.player_id = p.id and su.match_id = m.id
group by p.id, p.first_name, p.last_name, p.position, p.team_id, c.season_id, m.competition_id;

-- Index on the materialized view for fast lookups
create index v_season_player_totals_player_idx on v_season_player_totals(player_id);
create index v_season_player_totals_season_idx on v_season_player_totals(season_id);
