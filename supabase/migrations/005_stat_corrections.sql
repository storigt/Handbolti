-- ─── Migration 005: Stat Corrections ─────────────────────────────────────────
-- 1. Rename numerical_state 'equal' → '6v6' (6á6)
-- 2. Rename phase_type 'normal' → 'set_play' (Uppstilltur leikur)
-- 3. Add ATTACKING_ACTION event type (for offensive rebounds / Sóknarfrákast)
-- 4. Recreate affected views with corrected columns

-- ─── 1. numerical_state: 'equal' → '6v6' ────────────────────────────────────
alter table events drop constraint events_numerical_state_check;
alter table events add constraint events_numerical_state_check check (numerical_state in (
  '6v6',        -- 6á6 — normal equal numbers (was 'equal')
  'inferiority', -- undirtala
  'superiority', -- yfirtala
  '7v6',         -- 7á6
  '6v7'          -- 6á7
));

-- ─── 2. phase_type: 'normal' → 'set_play' ───────────────────────────────────
alter table events drop constraint events_phase_type_check;
alter table events add constraint events_phase_type_check check (phase_type in (
  'set_play',    -- uppstilltur leikur (was 'normal')
  'fast_break',  -- hraðaupphlaup
  'second_wave'  -- seinni bylgja
));

-- ─── 3. Add ATTACKING_ACTION event type ──────────────────────────────────────
-- sub_type: 'offensive_rebound' (Sóknarfrákast)
alter table events drop constraint events_event_type_check;
alter table events add constraint events_event_type_check check (event_type in (
  'SHOT',
  'TURNOVER',
  'SUSPENSION',
  'FOUL',
  'GOALKEEPER_ACTION',
  'TIMEOUT',
  'PERIOD_MARKER',
  'SUBSTITUTION',
  'DEFENSIVE_ACTION',
  'ATTACKING_ACTION'  -- offensive rebounds etc.
));

-- ─── 4. Recreate views ───────────────────────────────────────────────────────
-- Must DROP CASCADE because CREATE OR REPLACE VIEW cannot rename columns.
-- Views that depend on v_shots (v_shot_efficiency_by_player, v_player_attacking_stats)
-- are also dropped here and recreated below.
drop view if exists v_player_attacking_stats cascade;
drop view if exists v_shot_efficiency_by_player cascade;
drop view if exists v_defensive_actions_by_player cascade;
drop view if exists v_goalkeeper_performance cascade;
drop view if exists v_shots cascade;

-- v_shots: add is_set_play and is_6v6 flags
create view v_shots as
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
  (e.sub_type = 'goal')              as is_goal,
  (e.sub_type in ('goal','saved'))   as is_on_target,
  (e.shot_range = 'penalty')         as is_penalty,
  (e.shot_range = 'corner_wing')     as is_corner,
  (e.shot_range = '9m_plus')         as is_9m_plus,
  (e.shot_range = '7_8m')            as is_7_8m,
  (e.shot_range = '6m')              as is_6m,
  (e.shot_range = 'line')            as is_line,
  (e.phase_type = 'set_play')        as is_set_play,
  (e.phase_type = 'fast_break')      as is_fast_break,
  (e.phase_type = 'second_wave')     as is_second_wave,
  (e.numerical_state = '6v6')        as is_6v6,
  (e.numerical_state = 'inferiority') as is_inferiority,
  (e.numerical_state = 'superiority') as is_superiority,
  (e.numerical_state = '7v6')        as is_7v6
from events e
where e.event_type = 'SHOT'
  and e.is_voided = false
  and e.is_edited = false;

-- v_shot_efficiency_by_player: add set_play and 6v6 columns
create view v_shot_efficiency_by_player as
select
  s.player_id, s.match_id, s.team_id,
  count(*)                                                         as shots_attempted,
  count(*) filter (where s.is_on_target)                          as shots_on_target,
  count(*) filter (where s.is_goal)                               as goals,
  round(count(*) filter (where s.is_goal)::numeric / nullif(count(*),0) * 100,1) as shot_efficiency,
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
  count(*) filter (where s.is_set_play)                           as shots_set_play,
  count(*) filter (where s.is_goal and s.is_set_play)             as goals_set_play,
  count(*) filter (where s.is_fast_break)                         as shots_fast_break,
  count(*) filter (where s.is_goal and s.is_fast_break)           as goals_fast_break,
  count(*) filter (where s.is_second_wave)                        as shots_second_wave,
  count(*) filter (where s.is_goal and s.is_second_wave)          as goals_second_wave,
  count(*) filter (where s.is_6v6)                                as shots_6v6,
  count(*) filter (where s.is_goal and s.is_6v6)                  as goals_6v6,
  count(*) filter (where s.is_inferiority)                        as shots_inferiority,
  count(*) filter (where s.is_goal and s.is_inferiority)          as goals_inferiority,
  count(*) filter (where s.is_superiority)                        as shots_superiority,
  count(*) filter (where s.is_goal and s.is_superiority)          as goals_superiority,
  count(*) filter (where s.is_7v6)                                as shots_7v6,
  count(*) filter (where s.is_goal and s.is_7v6)                  as goals_7v6
from v_shots s
where s.player_id is not null
group by s.player_id, s.match_id, s.team_id;

-- v_player_attacking_stats: remove offensive_fouls, add offensive_rebound, 6v6, set_play
create view v_player_attacking_stats as
with
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
  where event_type = 'ATTACKING_ACTION' and player_id is not null
    and is_voided = false and is_edited = false
  union
  select player_id, match_id, team_id from events
  where event_type = 'SUSPENSION' and sub_type = '2min' and player_id is not null
    and is_voided = false and is_edited = false
),
shots as (
  select player_id, match_id, team_id,
    count(*)                                                               as shots_attempted,
    count(*) filter (where sub_type = 'goal')                             as goals,
    count(*) filter (where shot_range = 'penalty')                        as shots_penalty,
    count(*) filter (where sub_type='goal' and shot_range='penalty')      as goals_penalty,
    count(*) filter (where shot_range = 'corner_wing')                    as shots_corner,
    count(*) filter (where sub_type='goal' and shot_range='corner_wing')  as goals_corner,
    count(*) filter (where shot_range = '9m_plus')                        as shots_9m_plus,
    count(*) filter (where sub_type='goal' and shot_range='9m_plus')      as goals_9m_plus,
    count(*) filter (where shot_range = '7_8m')                           as shots_7_8m,
    count(*) filter (where sub_type='goal' and shot_range='7_8m')         as goals_7_8m,
    count(*) filter (where shot_range = '6m')                             as shots_6m,
    count(*) filter (where sub_type='goal' and shot_range='6m')           as goals_6m,
    count(*) filter (where shot_range = 'line')                           as shots_line,
    count(*) filter (where sub_type='goal' and shot_range='line')         as goals_line,
    count(*) filter (where phase_type = 'set_play')                       as shots_set_play,
    count(*) filter (where sub_type='goal' and phase_type='set_play')     as goals_set_play,
    count(*) filter (where phase_type = 'fast_break')                     as shots_fast_break,
    count(*) filter (where sub_type='goal' and phase_type='fast_break')   as goals_fast_break,
    count(*) filter (where phase_type = 'second_wave')                    as shots_second_wave,
    count(*) filter (where sub_type='goal' and phase_type='second_wave')  as goals_second_wave,
    count(*) filter (where numerical_state = '6v6')                       as shots_6v6,
    count(*) filter (where sub_type='goal' and numerical_state='6v6')     as goals_6v6,
    count(*) filter (where numerical_state = 'inferiority')               as shots_inferiority,
    count(*) filter (where sub_type='goal' and numerical_state='inferiority') as goals_inferiority,
    count(*) filter (where numerical_state = 'superiority')               as shots_superiority,
    count(*) filter (where sub_type='goal' and numerical_state='superiority') as goals_superiority,
    count(*) filter (where numerical_state = '7v6')                       as shots_7v6,
    count(*) filter (where sub_type='goal' and numerical_state='7v6')     as goals_7v6
  from events
  where event_type = 'SHOT' and player_id is not null
    and is_voided = false and is_edited = false
  group by player_id, match_id, team_id
),
chances as (
  select (context->>'assist_player_id')::uuid as player_id, match_id, team_id,
    count(*)                                      as chances_created,
    count(*) filter (where sub_type = 'goal')     as assists
  from events
  where event_type = 'SHOT' and context->>'assist_player_id' is not null
    and is_voided = false and is_edited = false
  group by (context->>'assist_player_id')::uuid, match_id, team_id
),
penalty_ast as (
  select (context->>'assist_player_id')::uuid as player_id, match_id,
    count(*) as penalty_assists
  from events
  where event_type = 'SHOT' and shot_range = 'penalty' and sub_type = 'goal'
    and context->>'assist_player_id' is not null
    and is_voided = false and is_edited = false
  group by (context->>'assist_player_id')::uuid, match_id
),
drew_pen as (
  select (context->>'fouled_player_id')::uuid as player_id, match_id,
    count(*) as drew_penalty
  from events
  where event_type = 'FOUL' and sub_type = '7m_awarded'
    and context->>'fouled_player_id' is not null
    and is_voided = false and is_edited = false
  group by (context->>'fouled_player_id')::uuid, match_id
),
tvs as (
  select player_id, match_id, team_id,
    count(*) as turnovers
  from events
  where event_type = 'TURNOVER' and player_id is not null
    and is_voided = false and is_edited = false
  group by player_id, match_id, team_id
),
-- Sóknarfrákast: offensive rebounds
off_reb as (
  select player_id, match_id, team_id,
    count(*) as offensive_rebounds
  from events
  where event_type = 'ATTACKING_ACTION' and sub_type = 'offensive_rebound'
    and player_id is not null
    and is_voided = false and is_edited = false
  group by player_id, match_id, team_id
),
susp as (
  select player_id, match_id,
    count(*) filter (where sub_type = '2min') as received_2min
  from events
  where event_type = 'SUSPENSION' and player_id is not null
    and is_voided = false and is_edited = false
  group by player_id, match_id
)
select
  b.player_id, b.match_id, b.team_id,
  coalesce(s.shots_attempted, 0)   as shots_attempted,
  coalesce(s.goals, 0)             as goals,
  round(coalesce(s.goals,0)::numeric / nullif(coalesce(s.shots_attempted,0),0) * 100,1) as shot_efficiency,
  coalesce(s.shots_penalty, 0)     as shots_penalty,
  coalesce(s.goals_penalty, 0)     as goals_penalty,
  coalesce(s.shots_corner, 0)      as shots_corner,
  coalesce(s.goals_corner, 0)      as goals_corner,
  coalesce(s.shots_9m_plus, 0)     as shots_9m_plus,
  coalesce(s.goals_9m_plus, 0)     as goals_9m_plus,
  coalesce(s.shots_7_8m, 0)        as shots_7_8m,
  coalesce(s.goals_7_8m, 0)        as goals_7_8m,
  coalesce(s.shots_6m, 0)          as shots_6m,
  coalesce(s.goals_6m, 0)          as goals_6m,
  coalesce(s.shots_line, 0)        as shots_line,
  coalesce(s.goals_line, 0)        as goals_line,
  coalesce(s.shots_set_play, 0)    as shots_set_play,
  coalesce(s.goals_set_play, 0)    as goals_set_play,
  coalesce(s.shots_fast_break, 0)  as shots_fast_break,
  coalesce(s.goals_fast_break, 0)  as goals_fast_break,
  coalesce(s.shots_second_wave, 0) as shots_second_wave,
  coalesce(s.goals_second_wave, 0) as goals_second_wave,
  coalesce(s.shots_6v6, 0)         as shots_6v6,
  coalesce(s.goals_6v6, 0)         as goals_6v6,
  coalesce(s.shots_inferiority, 0) as shots_inferiority,
  coalesce(s.goals_inferiority, 0) as goals_inferiority,
  coalesce(s.shots_superiority, 0) as shots_superiority,
  coalesce(s.goals_superiority, 0) as goals_superiority,
  coalesce(s.shots_7v6, 0)         as shots_7v6,
  coalesce(s.goals_7v6, 0)         as goals_7v6,
  coalesce(c.chances_created, 0)   as chances_created,
  coalesce(c.assists, 0)           as assists,
  coalesce(pa.penalty_assists, 0)  as penalty_assists,
  coalesce(dp.drew_penalty, 0)     as drew_penalty,
  coalesce(t.turnovers, 0)         as turnovers,
  coalesce(r.offensive_rebounds, 0) as offensive_rebounds,
  coalesce(su.received_2min, 0)    as received_2min
from base b
left join shots s        on s.player_id = b.player_id and s.match_id = b.match_id
left join chances c      on c.player_id = b.player_id and c.match_id = b.match_id
left join penalty_ast pa on pa.player_id = b.player_id and pa.match_id = b.match_id
left join drew_pen dp    on dp.player_id = b.player_id and dp.match_id = b.match_id
left join tvs t          on t.player_id = b.player_id and t.match_id = b.match_id
left join off_reb r      on r.player_id = b.player_id and r.match_id = b.match_id
left join susp su        on su.player_id = b.player_id and su.match_id = b.match_id;

-- v_defensive_actions_by_player: drew_offensive_foul → rebound (Frákast)
create view v_defensive_actions_by_player as
select
  e.player_id, e.match_id, e.team_id,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='duel_won')       as duels_won,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION'
    and e.sub_type in ('duel_won','duel_lost'))                                             as duels_total,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='high_contact')   as high_contact,
  count(*) filter (where e.event_type='FOUL' and e.sub_type='attacking_foul')             as fouls_committed,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='interception')   as interceptions,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='block')          as blocks,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='rebound')        as rebounds,
  count(*) filter (where e.event_type='FOUL' and e.sub_type='7m_awarded')                 as penalties_conceded,
  count(*) filter (where e.event_type='SUSPENSION' and e.sub_type='yellow_card')          as yellow_cards,
  count(*) filter (where e.event_type='SUSPENSION' and e.sub_type='2min')                 as suspensions_2min,
  count(*) filter (where e.event_type='SUSPENSION' and e.sub_type='red_card')             as red_cards,
  count(*) filter (where e.event_type='DEFENSIVE_ACTION' and e.sub_type='protest')        as protests
from events e
where e.player_id is not null
  and e.is_voided = false and e.is_edited = false
  and e.event_type in ('DEFENSIVE_ACTION', 'FOUL', 'SUSPENSION')
group by e.player_id, e.match_id, e.team_id;

-- v_goalkeeper_performance: remove non-shot attacking columns (they're in v_player_attacking_stats)
create view v_goalkeeper_performance as
with
gk_events as (
  select
    gk.player_id  as gk_player_id,
    gk.match_id,
    gk.team_id,
    gk.id         as gk_event_id,
    gk.sub_type,
    gk.wall_clock as gk_time,
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
gk_phase_stats as (
  select
    gmt.gk_player_id,
    gmt.match_id,
    count(*) filter (where ep.is_empty_phase and ep.team_id != gmt.gk_team_id) as empty_phases,
    coalesce(sum(ep.run_length) filter (where ep.is_empty_phase and ep.team_id != gmt.gk_team_id), 0) as total_phase_goals
  from (
    select distinct gk_player_id, match_id, team_id as gk_team_id from gk_events
  ) gmt
  join v_empty_phases ep on ep.match_id = gmt.match_id
  group by gmt.gk_player_id, gmt.match_id
),
gk_positive_response as (
  select
    gk.player_id as gk_player_id,
    gk.match_id,
    count(*)     as positive_responses
  from (
    select player_id, match_id, wall_clock as save_time, team_id
    from events
    where event_type = 'GOALKEEPER_ACTION' and sub_type = 'save'
      and is_voided = false and is_edited = false
  ) gk
  join lateral (
    select count(*) as consec_goals
    from events g
    where g.match_id = gk.match_id
      and g.event_type = 'SHOT' and g.sub_type = 'goal'
      and g.team_id = gk.team_id
      and g.wall_clock > gk.save_time
      and g.is_voided = false and g.is_edited = false
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
  -- Overall
  count(*)                                                                        as shots_faced,
  count(*) filter (where g.sub_type = 'save')                                    as saves,
  count(*) filter (where g.sub_type = 'goal_conceded')                           as goals_conceded,
  round(count(*) filter (where g.sub_type='save')::numeric / nullif(count(*),0) * 100,1) as save_pct,
  -- Víti
  count(*) filter (where g.shot_range = 'penalty')                               as faced_penalty,
  count(*) filter (where g.sub_type='save' and g.shot_range='penalty')           as saved_penalty,
  -- Horn
  count(*) filter (where g.shot_range = 'corner_wing')                           as faced_corner,
  count(*) filter (where g.sub_type='save' and g.shot_range='corner_wing')       as saved_corner,
  -- 9m+
  count(*) filter (where g.shot_range = '9m_plus')                               as faced_9m_plus,
  count(*) filter (where g.sub_type='save' and g.shot_range='9m_plus')           as saved_9m_plus,
  count(*) filter (where g.sub_type='goal_conceded' and g.shot_range='9m_plus')  as goals_9m_plus,
  -- 7-8m
  count(*) filter (where g.shot_range = '7_8m')                                  as faced_7_8m,
  count(*) filter (where g.sub_type='save' and g.shot_range='7_8m')              as saved_7_8m,
  -- 6m
  count(*) filter (where g.shot_range = '6m')                                    as faced_6m,
  count(*) filter (where g.sub_type='save' and g.shot_range='6m')                as saved_6m,
  -- Lína
  count(*) filter (where g.shot_range = 'line')                                  as faced_line,
  count(*) filter (where g.sub_type='save' and g.shot_range='line')              as saved_line,
  -- Uppstilltur leikur
  count(*) filter (where g.phase_type = 'set_play')                              as faced_set_play,
  count(*) filter (where g.sub_type='save' and g.phase_type='set_play')          as saved_set_play,
  -- Hraðaupphlaup
  count(*) filter (where g.phase_type = 'fast_break')                            as faced_fast_break,
  count(*) filter (where g.sub_type='save' and g.phase_type='fast_break')        as saved_fast_break,
  -- Seinni bylgja
  count(*) filter (where g.phase_type = 'second_wave')                           as faced_second_wave,
  count(*) filter (where g.sub_type='save' and g.phase_type='second_wave')       as saved_second_wave,
  -- 6á6
  count(*) filter (where g.numerical_state = '6v6')                              as faced_6v6,
  count(*) filter (where g.sub_type='save' and g.numerical_state='6v6')          as saved_6v6,
  -- Undirtala
  count(*) filter (where g.numerical_state = 'inferiority')                      as faced_inferiority,
  count(*) filter (where g.sub_type='save' and g.numerical_state='inferiority')  as saved_inferiority,
  -- Yfirtala
  count(*) filter (where g.numerical_state = 'superiority')                      as faced_superiority,
  count(*) filter (where g.sub_type='save' and g.numerical_state='superiority')  as saved_superiority,
  -- 6á7
  count(*) filter (where g.numerical_state = '6v7')                              as faced_6v7,
  count(*) filter (where g.sub_type='save' and g.numerical_state='6v7')          as saved_6v7,
  -- Phase stats
  coalesce(gps.empty_phases, 0)                                                  as empty_phases,
  coalesce(gps.total_phase_goals, 0)                                             as total_phase_goals,
  coalesce(gpr.positive_responses, 0)                                            as positive_responses
from gk_events g
left join gk_phase_stats gps  on gps.gk_player_id = g.gk_player_id and gps.match_id = g.match_id
left join gk_positive_response gpr on gpr.gk_player_id = g.gk_player_id and gpr.match_id = g.match_id
group by g.gk_player_id, g.match_id, g.team_id,
  gps.empty_phases, gps.total_phase_goals, gpr.positive_responses;
