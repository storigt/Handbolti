-- ─── Migration 004: Rebuilt Views ────────────────────────────────────────────
-- Drops all existing views and recreates them to match the full stat column
-- specification for attacking, defending, and goalkeeping.
--
-- Attacking columns (v_player_attacking_stats):
--   shots by range (6m,7-8m,9m+,line,penalty,corner), by phase (fast_break,
--   second_wave), by numerical state (inferiority,superiority,7v6),
--   plus chances_created, assists, penalty_assists, drew_penalty,
--   turnovers, offensive_fouls, received_2min
--
-- Defending columns (v_defensive_actions_by_player):
--   duels (won/total), high_contact, fouls_committed (fríkast),
--   interceptions, blocks, drew_offensive_foul (frákast),
--   penalties_conceded, yellow, 2min, red, protests
--
-- Goalkeeping columns (v_goalkeeper_performance):
--   saves/shots_faced/save_pct overall + by range + by phase + by numerical,
--   plus chances_created, assists, penalty_assists, drew_penalty, turnovers,
--   empty_phases, total_phases, positive_responses

-- ─── Drop in reverse dependency order ────────────────────────────────────────
drop materialized view if exists v_season_player_totals;
drop view if exists v_match_summary;
drop view if exists v_turnover_rate;
drop view if exists v_7m_efficiency;
drop view if exists v_fast_break_efficiency;
drop view if exists v_goalkeeper_save_pct_by_zone;
drop view if exists v_goalkeeper_performance;
drop view if exists v_player_attacking_stats;
drop view if exists v_defensive_actions_by_player;
drop view if exists v_shot_efficiency_by_zone;
drop view if exists v_shot_efficiency_by_player;
drop view if exists v_suspensions_by_player;
drop view if exists v_turnovers_by_player;
drop view if exists v_empty_phases;
drop view if exists v_shots;

-- ─── v_shots ─────────────────────────────────────────────────────────────────
create or replace view v_shots as
select
  e.id,
  e.match_id,
  e.period,
  e.match_clock,
  e.match_minute,
  e.wall_clock,
  e.team_id,
  e.player_id,
  e.lineup_id,
  e.sub_type,
  e.shot_range,
  e.phase_type,
  e.numerical_state,
  e.zone,
  e.context,
  (e.sub_type = 'goal')                         as is_goal,
  (e.sub_type in ('goal', 'saved'))              as is_on_target,
  (e.shot_range = 'penalty')                    as is_penalty,
  (e.shot_range = 'corner_wing')                as is_corner,
  (e.shot_range = '9m_plus')                    as is_9m_plus,
  (e.shot_range = '7_8m')                       as is_7_8m,
  (e.shot_range = '6m')                         as is_6m,
  (e.shot_range = 'line')                       as is_line,
  (e.phase_type = 'fast_break')                 as is_fast_break,
  (e.phase_type = 'second_wave')                as is_second_wave,
  (e.numerical_state = 'inferiority')           as is_inferiority,
  (e.numerical_state = 'superiority')           as is_superiority,
  (e.numerical_state = '7v6')                   as is_7v6
from events e
where
  e.event_type = 'SHOT'
  and e.is_voided = false
  and e.is_edited = false;

-- ─── v_shot_efficiency_by_player ─────────────────────────────────────────────
-- Pure shot stats per player per match (used by other views and for zone heatmap).
create or replace view v_shot_efficiency_by_player as
select
  s.player_id,
  s.match_id,
  s.team_id,
  count(*)                                                         as shots_attempted,
  count(*) filter (where s.is_on_target)                          as shots_on_target,
  count(*) filter (where s.is_goal)                               as goals,
  round(count(*) filter (where s.is_goal)::numeric
    / nullif(count(*), 0) * 100, 1)                               as shot_efficiency,
  count(*) filter (where s.is_penalty)                            as shots_penalty,
  count(*) filter (where s.is_goal and s.is_penalty)              as goals_penalty,
  count(*) filter (where s.is_corner)                             as shots_corner,
  count(*) filter (where s.is_goal and s.is_corner)               as goals_corner,
  count(*) filter (where s.is_9m_plus)                            as shots_9m_plus,
  count(*) filter (where s.is_goal and s.is_9m_plus)              as goals_9m_plus,
  count(*) filter (where s.is_7_8m)                               as shots_7_8m,
  count(*) filter (where s.is_goal and s.is_7_8m)                 as goals_7_8m,
  count(*) filter (where s.is_6m)                                 as shots_6m,
  count(*) filter (where s.is_goal and s.is_6m)                   as goals_6m,
  count(*) filter (where s.is_line)                               as shots_line,
  count(*) filter (where s.is_goal and s.is_line)                 as goals_line,
  count(*) filter (where s.is_fast_break)                         as shots_fast_break,
  count(*) filter (where s.is_goal and s.is_fast_break)           as goals_fast_break,
  count(*) filter (where s.is_second_wave)                        as shots_second_wave,
  count(*) filter (where s.is_goal and s.is_second_wave)          as goals_second_wave,
  count(*) filter (where s.is_inferiority)                        as shots_inferiority,
  count(*) filter (where s.is_goal and s.is_inferiority)          as goals_inferiority,
  count(*) filter (where s.is_superiority)                        as shots_superiority,
  count(*) filter (where s.is_goal and s.is_superiority)          as goals_superiority,
  count(*) filter (where s.is_7v6)                                as shots_7v6,
  count(*) filter (where s.is_goal and s.is_7v6)                  as goals_7v6
from v_shots s
where s.player_id is not null
group by s.player_id, s.match_id, s.team_id;

-- ─── v_player_attacking_stats ─────────────────────────────────────────────────
-- Full attacking stat table — all columns from the attacking spec in one view.
--
-- Assists/chances use context->>'assist_player_id' on SHOT events.
-- Drew penalty uses context->>'fouled_player_id' on FOUL '7m_awarded' events.
-- Turnovers, offensive fouls, received 2-min from their respective event types.
create or replace view v_player_attacking_stats as
with
-- Union of all player/match combinations that appear in any attacking event
base as (
  select player_id, match_id, team_id from events
  where event_type = 'SHOT' and player_id is not null
    and is_voided = false and is_edited = false
  union
  select (context->>'assist_player_id')::uuid, match_id, team_id from events
  where event_type = 'SHOT' and context->>'assist_player_id' is not null
    and is_voided = false and is_edited = false
  union
  select (context->>'fouled_player_id')::uuid, match_id, team_id from events
  where event_type = 'FOUL' and sub_type = '7m_awarded'
    and context->>'fouled_player_id' is not null
    and is_voided = false and is_edited = false
  union
  select player_id, match_id, team_id from events
  where event_type = 'TURNOVER' and player_id is not null
    and is_voided = false and is_edited = false
  union
  select player_id, match_id, team_id from events
  where event_type = 'SUSPENSION' and sub_type = '2min' and player_id is not null
    and is_voided = false and is_edited = false
),
shots as (
  select player_id, match_id, team_id,
    count(*)                                                              as shots_attempted,
    count(*) filter (where sub_type = 'goal')                            as goals,
    count(*) filter (where shot_range = 'penalty')                       as shots_penalty,
    count(*) filter (where sub_type='goal' and shot_range='penalty')     as goals_penalty,
    count(*) filter (where shot_range = 'corner_wing')                   as shots_corner,
    count(*) filter (where sub_type='goal' and shot_range='corner_wing') as goals_corner,
    count(*) filter (where shot_range = '9m_plus')                       as shots_9m_plus,
    count(*) filter (where sub_type='goal' and shot_range='9m_plus')     as goals_9m_plus,
    count(*) filter (where shot_range = '7_8m')                          as shots_7_8m,
    count(*) filter (where sub_type='goal' and shot_range='7_8m')        as goals_7_8m,
    count(*) filter (where shot_range = '6m')                            as shots_6m,
    count(*) filter (where sub_type='goal' and shot_range='6m')          as goals_6m,
    count(*) filter (where shot_range = 'line')                          as shots_line,
    count(*) filter (where sub_type='goal' and shot_range='line')        as goals_line,
    count(*) filter (where phase_type = 'fast_break')                    as shots_fast_break,
    count(*) filter (where sub_type='goal' and phase_type='fast_break')  as goals_fast_break,
    count(*) filter (where phase_type = 'second_wave')                   as shots_second_wave,
    count(*) filter (where sub_type='goal' and phase_type='second_wave') as goals_second_wave,
    count(*) filter (where numerical_state = 'inferiority')              as shots_inferiority,
    count(*) filter (where sub_type='goal' and numerical_state='inferiority') as goals_inferiority,
    count(*) filter (where numerical_state = 'superiority')              as shots_superiority,
    count(*) filter (where sub_type='goal' and numerical_state='superiority') as goals_superiority,
    count(*) filter (where numerical_state = '7v6')                      as shots_7v6,
    count(*) filter (where sub_type='goal' and numerical_state='7v6')    as goals_7v6
  from events
  where event_type = 'SHOT' and player_id is not null
    and is_voided = false and is_edited = false
  group by player_id, match_id, team_id
),
-- Sköpuð færi (chances created) = any shot where this player assisted
-- Stoðsending (assists)          = only assisted goals
chances as (
  select (context->>'assist_player_id')::uuid as player_id, match_id, team_id,
    count(*)                                       as chances_created,
    count(*) filter (where sub_type = 'goal')      as assists
  from events
  where event_type = 'SHOT' and context->>'assist_player_id' is not null
    and is_voided = false and is_edited = false
  group by (context->>'assist_player_id')::uuid, match_id, team_id
),
-- Víta sending (penalty assist) = assisted a penalty goal
penalty_ast as (
  select (context->>'assist_player_id')::uuid as player_id, match_id,
    count(*) as penalty_assists
  from events
  where event_type = 'SHOT' and shot_range = 'penalty' and sub_type = 'goal'
    and context->>'assist_player_id' is not null
    and is_voided = false and is_edited = false
  group by (context->>'assist_player_id')::uuid, match_id
),
-- Fiskað víti (drew penalty) = was fouled and a 7m was awarded
drew_pen as (
  select (context->>'fouled_player_id')::uuid as player_id, match_id,
    count(*) as drew_penalty
  from events
  where event_type = 'FOUL' and sub_type = '7m_awarded'
    and context->>'fouled_player_id' is not null
    and is_voided = false and is_edited = false
  group by (context->>'fouled_player_id')::uuid, match_id
),
-- Tapaður bolti (turnovers) + Sóknarfrákast (offensive fouls)
tvs as (
  select player_id, match_id, team_id,
    count(*)                                                    as turnovers,
    count(*) filter (where sub_type = 'offensive_foul')         as offensive_fouls
  from events
  where event_type = 'TURNOVER' and player_id is not null
    and is_voided = false and is_edited = false
  group by player_id, match_id, team_id
),
-- Fengnar 2 mín (received 2-min)
susp as (
  select player_id, match_id,
    count(*) filter (where sub_type = '2min') as received_2min
  from events
  where event_type = 'SUSPENSION' and player_id is not null
    and is_voided = false and is_edited = false
  group by player_id, match_id
)
select
  b.player_id,
  b.match_id,
  b.team_id,
  -- Mörk / Skot / Skotnýting%
  coalesce(s.shots_attempted, 0)                                      as shots_attempted,
  coalesce(s.goals, 0)                                                 as goals,
  round(coalesce(s.goals,0)::numeric / nullif(coalesce(s.shots_attempted,0),0) * 100, 1) as shot_efficiency,
  -- Víti
  coalesce(s.shots_penalty, 0)                                         as shots_penalty,
  coalesce(s.goals_penalty, 0)                                         as goals_penalty,
  -- Horn
  coalesce(s.shots_corner, 0)                                          as shots_corner,
  coalesce(s.goals_corner, 0)                                          as goals_corner,
  -- 9m+
  coalesce(s.shots_9m_plus, 0)                                         as shots_9m_plus,
  coalesce(s.goals_9m_plus, 0)                                         as goals_9m_plus,
  -- 7-8m
  coalesce(s.shots_7_8m, 0)                                            as shots_7_8m,
  coalesce(s.goals_7_8m, 0)                                            as goals_7_8m,
  -- 6m
  coalesce(s.shots_6m, 0)                                              as shots_6m,
  coalesce(s.goals_6m, 0)                                              as goals_6m,
  -- Lína
  coalesce(s.shots_line, 0)                                            as shots_line,
  coalesce(s.goals_line, 0)                                            as goals_line,
  -- Hraðaupphlaup
  coalesce(s.shots_fast_break, 0)                                      as shots_fast_break,
  coalesce(s.goals_fast_break, 0)                                      as goals_fast_break,
  -- Seinni bylgja
  coalesce(s.shots_second_wave, 0)                                     as shots_second_wave,
  coalesce(s.goals_second_wave, 0)                                     as goals_second_wave,
  -- Undirtala
  coalesce(s.shots_inferiority, 0)                                     as shots_inferiority,
  coalesce(s.goals_inferiority, 0)                                     as goals_inferiority,
  -- Yfirtala
  coalesce(s.shots_superiority, 0)                                     as shots_superiority,
  coalesce(s.goals_superiority, 0)                                     as goals_superiority,
  -- 7á6
  coalesce(s.shots_7v6, 0)                                             as shots_7v6,
  coalesce(s.goals_7v6, 0)                                             as goals_7v6,
  -- Sköpuð færi / Stoðsending / Víta sending / Fiskað víti
  coalesce(c.chances_created, 0)                                       as chances_created,
  coalesce(c.assists, 0)                                               as assists,
  coalesce(pa.penalty_assists, 0)                                      as penalty_assists,
  coalesce(dp.drew_penalty, 0)                                         as drew_penalty,
  -- Tapaður bolti / Sóknarfrákast / Fengnar 2 mín
  coalesce(t.turnovers, 0)                                             as turnovers,
  coalesce(t.offensive_fouls, 0)                                       as offensive_fouls,
  coalesce(su.received_2min, 0)                                        as received_2min
from base b
left join shots s         on s.player_id = b.player_id and s.match_id = b.match_id
left join chances c       on c.player_id = b.player_id and c.match_id = b.match_id
left join penalty_ast pa  on pa.player_id = b.player_id and pa.match_id = b.match_id
left join drew_pen dp     on dp.player_id = b.player_id and dp.match_id = b.match_id
left join tvs t           on t.player_id = b.player_id and t.match_id = b.match_id
left join susp su         on su.player_id = b.player_id and su.match_id = b.match_id;

-- ─── v_defensive_actions_by_player ───────────────────────────────────────────
-- Full defending stat table — all columns from the defending spec.
--
-- Fríkast (fouls_committed)       = FOUL attacking_foul by this player
-- Frákast (drew_offensive_foul)   = DEFENSIVE_ACTION drew_offensive_foul
-- Both are in DEFENSIVE_ACTION or FOUL event types.
create or replace view v_defensive_actions_by_player as
select
  e.player_id,
  e.match_id,
  e.team_id,
  -- Vinnur / Tapar árás 1á1
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='duel_won')  as duels_won,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION'
    and e.sub_type in ('duel_won','duel_lost'))                                       as duels_total,
  -- Hár kontakt (9m+)
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='high_contact') as high_contact,
  -- Fríkast (free throw conceded = defender fouled the attacker)
  count(*) filter (where e.event_type='FOUL' and e.sub_type='attacking_foul')        as fouls_committed,
  -- Stolinn
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='interception') as interceptions,
  -- Blokk
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='block')     as blocks,
  -- Frákast (drew offensive foul from attacker)
  count(*) filter (where e.event_type='DEFENSIVE_ACTION'
    and e.sub_type='drew_offensive_foul')                                             as drew_offensive_foul,
  -- Víti á (penalty conceded)
  count(*) filter (where e.event_type='FOUL' and e.sub_type='7m_awarded')            as penalties_conceded,
  -- Gult / 2Mín / Rautt / Værukærð
  count(*) filter (where e.event_type='SUSPENSION' and e.sub_type='yellow_card')     as yellow_cards,
  count(*) filter (where e.event_type='SUSPENSION' and e.sub_type='2min')            as suspensions_2min,
  count(*) filter (where e.event_type='SUSPENSION' and e.sub_type='red_card')        as red_cards,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='protest')   as protests
from events e
where
  e.player_id is not null
  and e.is_voided = false
  and e.is_edited = false
  and e.event_type in ('DEFENSIVE_ACTION', 'FOUL', 'SUSPENSION')
group by e.player_id, e.match_id, e.team_id;

-- ─── v_shot_efficiency_by_zone ────────────────────────────────────────────────
create or replace view v_shot_efficiency_by_zone as
select
  s.match_id,
  s.team_id,
  s.zone,
  s.shot_range,
  s.phase_type,
  count(*)                                           as shots_attempted,
  count(*) filter (where s.is_goal)                  as goals,
  round(count(*) filter (where s.is_goal)::numeric
    / nullif(count(*), 0) * 100, 1)                  as efficiency
from v_shots s
group by s.match_id, s.team_id, s.zone, s.shot_range, s.phase_type;

-- ─── v_turnovers_by_player ───────────────────────────────────────────────────
create or replace view v_turnovers_by_player as
select
  e.player_id, e.match_id, e.team_id,
  count(*)                                                       as total_turnovers,
  count(*) filter (where e.sub_type = 'bad_pass')               as bad_passes,
  count(*) filter (where e.sub_type = 'lost_dribble')           as lost_dribbles,
  count(*) filter (where e.sub_type = 'offensive_foul')         as offensive_fouls,
  count(*) filter (where e.sub_type = 'stepped')                as stepped,
  count(*) filter (where e.sub_type = 'double_dribble')         as double_dribbles,
  count(*) filter (where e.sub_type = 'out_of_bounds')          as out_of_bounds,
  count(*) filter (where e.sub_type = 'shot_clock')             as shot_clock_violations,
  count(*) filter (where e.sub_type = 'other')                  as other_turnovers
from events e
where e.event_type = 'TURNOVER' and e.is_voided = false and e.is_edited = false
group by e.player_id, e.match_id, e.team_id;

-- ─── v_suspensions_by_player ─────────────────────────────────────────────────
create or replace view v_suspensions_by_player as
select
  e.player_id, e.match_id, e.team_id,
  count(*) filter (where e.sub_type = '2min')               as suspensions_2min,
  count(*) filter (where e.sub_type = '2min') * 2           as minutes_suspended,
  count(*) filter (where e.sub_type = 'yellow_card')        as yellow_cards,
  count(*) filter (where e.sub_type = 'red_card')           as red_cards,
  count(*) filter (where e.sub_type = 'blue_card')          as blue_cards,
  count(*) filter (where e.sub_type = 'disqualification')   as disqualifications
from events e
where e.event_type = 'SUSPENSION' and e.is_voided = false and e.is_edited = false
group by e.player_id, e.match_id, e.team_id;

-- ─── v_empty_phases ──────────────────────────────────────────────────────────
-- Runs of 3+ consecutive goals by the same team in a match.
-- Used both for team-level stats and as input for GK phase stats.
create or replace view v_empty_phases as
with ordered_goals as (
  select
    match_id, team_id, wall_clock, lineup_id,
    row_number() over (partition by match_id order by wall_clock)          as abs_rn,
    row_number() over (partition by match_id, team_id order by wall_clock) as team_rn
  from events
  where event_type = 'SHOT' and sub_type = 'goal'
    and is_voided = false and is_edited = false
),
runs as (
  -- Gap-and-islands: abs_rn - team_rn is constant within a consecutive run by the same team
  select
    match_id, team_id,
    abs_rn - team_rn as grp,
    count(*)         as run_length,
    min(abs_rn)      as first_abs_rn   -- used to look up lineup at run start
  from ordered_goals
  group by match_id, team_id, abs_rn - team_rn
)
select
  r.match_id,
  r.team_id,
  r.grp,
  r.run_length,
  og.lineup_id    as first_lineup_id,
  (r.run_length >= 3) as is_empty_phase
from runs r
join ordered_goals og
  on og.match_id = r.match_id
 and og.team_id  = r.team_id
 and og.abs_rn   = r.first_abs_rn;

-- ─── v_goalkeeper_performance ────────────────────────────────────────────────
-- Full goalkeeping stat table — all columns from the GK spec:
--   overall + by shot_range + by phase_type + by numerical_state,
--   plus chances_created, assists, penalty_assists, drew_penalty, turnovers,
--   empty_phases, total_phases, positive_responses.
--
-- Shot range/phase/numerical data is pulled from the linked SHOT event
-- via event_links (goalkeeper_response link).
--
-- Positive Response: after a GK save, the GK's team scores 3+ consecutive
-- goals before the opponent replies.
create or replace view v_goalkeeper_performance as
with
gk_events as (
  select
    gk.player_id                    as gk_player_id,
    gk.match_id,
    gk.team_id,
    gk.id                           as gk_event_id,
    gk.sub_type,
    gk.wall_clock                   as gk_time,
    s.shot_range,
    s.phase_type,
    s.numerical_state
  from events gk
  left join event_links el
    on el.linked_event_id = gk.id and el.link_type = 'goalkeeper_response'
  left join events s
    on s.id = el.primary_event_id and s.event_type = 'SHOT'
    and s.is_voided = false and s.is_edited = false
  where gk.event_type = 'GOALKEEPER_ACTION'
    and gk.sub_type in ('save', 'goal_conceded')
    and gk.is_voided = false and gk.is_edited = false
),
-- Non-shot attacking stats for the GK (same derivation as in v_player_attacking_stats)
gk_chances as (
  select (context->>'assist_player_id')::uuid as player_id, match_id,
    count(*)                                   as chances_created,
    count(*) filter (where sub_type = 'goal')  as assists
  from events
  where event_type = 'SHOT' and context->>'assist_player_id' is not null
    and is_voided = false and is_edited = false
  group by (context->>'assist_player_id')::uuid, match_id
),
gk_pen_ast as (
  select (context->>'assist_player_id')::uuid as player_id, match_id,
    count(*) as penalty_assists
  from events
  where event_type = 'SHOT' and shot_range = 'penalty' and sub_type = 'goal'
    and context->>'assist_player_id' is not null
    and is_voided = false and is_edited = false
  group by (context->>'assist_player_id')::uuid, match_id
),
gk_drew_pen as (
  select (context->>'fouled_player_id')::uuid as player_id, match_id,
    count(*) as drew_penalty
  from events
  where event_type = 'FOUL' and sub_type = '7m_awarded'
    and context->>'fouled_player_id' is not null
    and is_voided = false and is_edited = false
  group by (context->>'fouled_player_id')::uuid, match_id
),
gk_turnovers as (
  select player_id, match_id,
    count(*) as turnovers
  from events
  where event_type = 'TURNOVER' and player_id is not null
    and is_voided = false and is_edited = false
  group by player_id, match_id
),
-- Empty phases AGAINST this GK (opponent scores 3+ in a row while this GK played).
-- Uses the GK's team_id from their own GOALKEEPER_ACTION events as the reference.
-- ep.team_id != ge.team_id means the OPPONENT scored the run — bad for this GK.
gk_empty_phases as (
  select
    ge.gk_player_id,
    ge.match_id,
    count(*) filter (where ep.is_empty_phase and ep.team_id != ge.team_id) as empty_phases,
    coalesce(sum(ep.run_length) filter (where ep.is_empty_phase and ep.team_id != ge.team_id), 0) as total_phase_goals
  from (select distinct gk_player_id, match_id, team_id from gk_events) ge
  join v_empty_phases ep on ep.match_id = ge.match_id
  group by ge.gk_player_id, ge.match_id
),
-- Positive Response: GK saves, then their team scores 3+ consecutive goals
gk_positive_response as (
  select
    gk.player_id            as gk_player_id,
    gk.match_id,
    count(*)                as positive_responses
  from (
    select player_id, match_id, wall_clock as save_time, team_id
    from events
    where event_type = 'GOALKEEPER_ACTION' and sub_type = 'save'
      and is_voided = false and is_edited = false
  ) gk
  -- After the save, count consecutive goals by the GK's team before opponent scores
  join lateral (
    select count(*) as consec_goals
    from events g
    where g.match_id = gk.match_id
      and g.event_type = 'SHOT' and g.sub_type = 'goal'
      and g.team_id = gk.team_id
      and g.wall_clock > gk.save_time
      and g.is_voided = false and g.is_edited = false
      -- No opponent goal between the save and this goal
      and not exists (
        select 1 from events opp
        where opp.match_id = gk.match_id
          and opp.event_type = 'SHOT' and opp.sub_type = 'goal'
          and opp.team_id != gk.team_id
          and opp.wall_clock > gk.save_time
          and opp.wall_clock < g.wall_clock
          and opp.is_voided = false and opp.is_edited = false
      )
  ) seq on true
  where seq.consec_goals >= 3
  group by gk.player_id, gk.match_id
)
select
  g.gk_player_id             as goalkeeper_player_id,
  g.match_id,
  g.team_id,
  -- Overall: Varin / Fjöldi skota / Markvarsla%
  count(*)                                                              as shots_faced,
  count(*) filter (where g.sub_type = 'save')                          as saves,
  count(*) filter (where g.sub_type = 'goal_conceded')                 as goals_conceded,
  round(count(*) filter (where g.sub_type = 'save')::numeric
    / nullif(count(*), 0) * 100, 1)                                     as save_pct,
  -- Víti: Varin / Skot / Vítavarsla%
  count(*) filter (where g.shot_range = 'penalty')                     as faced_penalty,
  count(*) filter (where g.sub_type='save' and g.shot_range='penalty') as saved_penalty,
  -- Horn: Varin / Skot / Hornavarsla%
  count(*) filter (where g.shot_range = 'corner_wing')                 as faced_corner,
  count(*) filter (where g.sub_type='save' and g.shot_range='corner_wing') as saved_corner,
  -- 9m+: Varin / Mörk / Varsla 9m+%
  count(*) filter (where g.shot_range = '9m_plus')                     as faced_9m_plus,
  count(*) filter (where g.sub_type='save' and g.shot_range='9m_plus') as saved_9m_plus,
  count(*) filter (where g.sub_type='goal_conceded' and g.shot_range='9m_plus') as goals_9m_plus,
  -- 7-8m
  count(*) filter (where g.shot_range = '7_8m')                        as faced_7_8m,
  count(*) filter (where g.sub_type='save' and g.shot_range='7_8m')    as saved_7_8m,
  -- 6m
  count(*) filter (where g.shot_range = '6m')                          as faced_6m,
  count(*) filter (where g.sub_type='save' and g.shot_range='6m')      as saved_6m,
  -- Lína
  count(*) filter (where g.shot_range = 'line')                        as faced_line,
  count(*) filter (where g.sub_type='save' and g.shot_range='line')    as saved_line,
  -- Hraðaupphlaup
  count(*) filter (where g.phase_type = 'fast_break')                  as faced_fast_break,
  count(*) filter (where g.sub_type='save' and g.phase_type='fast_break') as saved_fast_break,
  -- Seinni bylgja
  count(*) filter (where g.phase_type = 'second_wave')                 as faced_second_wave,
  count(*) filter (where g.sub_type='save' and g.phase_type='second_wave') as saved_second_wave,
  -- Undirtala
  count(*) filter (where g.numerical_state = 'inferiority')            as faced_inferiority,
  count(*) filter (where g.sub_type='save' and g.numerical_state='inferiority') as saved_inferiority,
  -- Yfirtala
  count(*) filter (where g.numerical_state = 'superiority')            as faced_superiority,
  count(*) filter (where g.sub_type='save' and g.numerical_state='superiority') as saved_superiority,
  -- 6á7 (GK faces 7 field players)
  count(*) filter (where g.numerical_state = '6v7')                    as faced_6v7,
  count(*) filter (where g.sub_type='save' and g.numerical_state='6v7') as saved_6v7,
  -- Sköpuð færi / Stoðsending / Víta sending / Fiskað víti / Tapaður bolti
  coalesce(gc.chances_created, 0)                                       as chances_created,
  coalesce(gc.assists, 0)                                               as assists,
  coalesce(gpa.penalty_assists, 0)                                      as penalty_assists,
  coalesce(gdp.drew_penalty, 0)                                         as drew_penalty,
  coalesce(gt.turnovers, 0)                                             as turnovers,
  -- Empty phase / Total phases / Positive Response
  coalesce(gep.empty_phases, 0)                                         as empty_phases,
  coalesce(gep.total_phase_goals, 0)                                    as total_phase_goals,
  coalesce(gpr.positive_responses, 0)                                   as positive_responses
from gk_events g
left join gk_chances gc       on gc.player_id = g.gk_player_id and gc.match_id = g.match_id
left join gk_pen_ast gpa      on gpa.player_id = g.gk_player_id and gpa.match_id = g.match_id
left join gk_drew_pen gdp     on gdp.player_id = g.gk_player_id and gdp.match_id = g.match_id
left join gk_turnovers gt     on gt.player_id = g.gk_player_id and gt.match_id = g.match_id
left join gk_empty_phases gep on gep.gk_player_id = g.gk_player_id and gep.match_id = g.match_id
left join gk_positive_response gpr on gpr.gk_player_id = g.gk_player_id and gpr.match_id = g.match_id
group by g.gk_player_id, g.match_id, g.team_id,
  gc.chances_created, gc.assists, gpa.penalty_assists, gdp.drew_penalty,
  gt.turnovers, gep.empty_phases, gep.total_phase_goals, gpr.positive_responses;

-- ─── v_goalkeeper_save_pct_by_zone ────────────────────────────────────────────
create or replace view v_goalkeeper_save_pct_by_zone as
select
  gk.player_id     as goalkeeper_player_id,
  gk.match_id,
  s.zone,
  count(*)                                           as shots_faced,
  count(*) filter (where gk.sub_type = 'save')       as saves,
  round(count(*) filter (where gk.sub_type = 'save')::numeric
    / nullif(count(*), 0) * 100, 1)                  as save_pct
from events gk
join event_links el
  on el.linked_event_id = gk.id and el.link_type = 'goalkeeper_response'
join events s
  on s.id = el.primary_event_id and s.event_type = 'SHOT'
  and s.is_voided = false and s.is_edited = false
where gk.event_type = 'GOALKEEPER_ACTION'
  and gk.sub_type in ('save', 'goal_conceded')
  and gk.is_voided = false and gk.is_edited = false
  and s.zone is not null
group by gk.player_id, gk.match_id, s.zone;

-- ─── v_turnover_rate ─────────────────────────────────────────────────────────
create or replace view v_turnover_rate as
select
  coalesce(t.player_id, s.player_id)   as player_id,
  coalesce(t.match_id, s.match_id)     as match_id,
  coalesce(t.team_id, s.team_id)       as team_id,
  coalesce(t.total_turnovers, 0)       as turnovers,
  coalesce(s.shots_attempted, 0)       as shots_attempted,
  coalesce(t.total_turnovers,0) + coalesce(s.shots_attempted,0) as possession_approx,
  round(
    coalesce(t.total_turnovers,0)::numeric
    / nullif(coalesce(t.total_turnovers,0) + coalesce(s.shots_attempted,0), 0) * 100, 1
  ) as turnover_rate
from v_turnovers_by_player t
full outer join v_shot_efficiency_by_player s
  on t.player_id = s.player_id and t.match_id = s.match_id;

-- ─── v_fast_break_efficiency ─────────────────────────────────────────────────
create or replace view v_fast_break_efficiency as
select
  s.team_id, s.match_id,
  count(*)                              as fast_break_attempts,
  count(*) filter (where s.is_goal)     as fast_break_goals,
  round(count(*) filter (where s.is_goal)::numeric / nullif(count(*),0) * 100, 1) as fast_break_efficiency
from v_shots s
where s.is_fast_break = true
group by s.team_id, s.match_id;

-- ─── v_7m_efficiency ─────────────────────────────────────────────────────────
create or replace view v_7m_efficiency as
select
  s.player_id, s.match_id, s.team_id,
  count(*)                              as attempts_7m,
  count(*) filter (where s.is_goal)     as goals_7m,
  round(count(*) filter (where s.is_goal)::numeric / nullif(count(*),0) * 100, 1) as efficiency_7m
from v_shots s
where s.is_penalty = true and s.player_id is not null
group by s.player_id, s.match_id, s.team_id;

-- ─── v_lineup_stats ──────────────────────────────────────────────────────────
create or replace view v_lineup_stats as
select
  e.lineup_id,
  cl.match_id,
  cl.player_ids,
  cl.period,
  e.team_id,
  count(*) filter (where e.event_type='SHOT')                            as shots,
  count(*) filter (where e.event_type='SHOT' and e.sub_type='goal')      as goals,
  count(*) filter (where e.event_type='TURNOVER')                        as turnovers,
  round(
    count(*) filter (where e.event_type='SHOT' and e.sub_type='goal')::numeric
    / nullif(count(*) filter (where e.event_type='SHOT'), 0) * 100, 1
  ) as shot_efficiency
from events e
join court_lineups cl on cl.id = e.lineup_id
where e.is_voided = false and e.is_edited = false and e.lineup_id is not null
group by e.lineup_id, cl.match_id, cl.player_ids, cl.period, e.team_id;

-- ─── v_match_summary ─────────────────────────────────────────────────────────
create or replace view v_match_summary as
select
  m.id                                     as match_id,
  m.match_date,
  m.home_team_id,
  m.away_team_id,
  m.status,
  t.id                                     as team_id,
  t.name                                   as team_name,
  coalesce(shots.total_goals, 0)           as goals,
  coalesce(shots.total_shots, 0)           as shots_attempted,
  shots.shot_efficiency,
  coalesce(fb.fast_break_goals, 0)         as fast_break_goals,
  coalesce(fb.fast_break_attempts, 0)      as fast_break_attempts,
  fb.fast_break_efficiency,
  coalesce(tv.total_turnovers, 0)          as total_turnovers,
  coalesce(susp.total_2min, 0)             as suspensions_2min
from matches m
cross join teams t
left join (
  select match_id, team_id,
    sum(goals) as total_goals, sum(shots_attempted) as total_shots,
    round(sum(goals)::numeric / nullif(sum(shots_attempted),0) * 100, 1) as shot_efficiency
  from v_shot_efficiency_by_player group by match_id, team_id
) shots on shots.match_id = m.id and shots.team_id = t.id
left join v_fast_break_efficiency fb on fb.match_id = m.id and fb.team_id = t.id
left join (
  select match_id, team_id, sum(total_turnovers) as total_turnovers
  from v_turnovers_by_player group by match_id, team_id
) tv on tv.match_id = m.id and tv.team_id = t.id
left join (
  select match_id, team_id, sum(suspensions_2min) as total_2min
  from v_suspensions_by_player group by match_id, team_id
) susp on susp.match_id = m.id and susp.team_id = t.id
where t.id in (m.home_team_id, m.away_team_id);

-- ─── v_season_player_totals (materialized) ───────────────────────────────────
create materialized view v_season_player_totals as
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
join competitions c on c.id = m.competition_id
left join v_shot_efficiency_by_player sp on sp.player_id = p.id and sp.match_id = m.id
left join v_turnovers_by_player tp on tp.player_id = p.id and tp.match_id = m.id
left join v_suspensions_by_player su on su.player_id = p.id and su.match_id = m.id
group by p.id, p.first_name, p.last_name, p.position, p.team_id, c.season_id, m.competition_id;

create index v_season_player_totals_player_idx on v_season_player_totals(player_id);
create index v_season_player_totals_season_idx on v_season_player_totals(season_id);
