-- ─── Migration 008: GK view + sub_type additions ─────────────────────────────
-- 1. Add 'delay' to TurnoverSubType (Töf)
-- 2. Add 'drew_suspension' to ATTACKING_ACTION sub_types (Fengnar 2 mín)
-- 3. Add 'empty_phase' and 'positive_response' to GOALKEEPER_ACTION sub_types
-- 4. Rebuild v_goalkeeper_performance to read shot_range/phase_type/numerical_state
--    directly from GOALKEEPER_ACTION events (no linked SHOT needed), and count
--    empty_phase / positive_response sub_types as simple event counts.

-- ─── 1–3. No CHECK constraint on sub_type — all sub_types are free text. ─────
-- The new values are valid the moment the TypeScript types are updated.
-- Nothing to ALTER here; sub_type has no DB-level constraint.

-- ─── 4. Rebuild v_goalkeeper_performance ─────────────────────────────────────
drop view if exists v_goalkeeper_performance;

create view v_goalkeeper_performance as
select
  e.player_id                                                                        as goalkeeper_player_id,
  e.match_id,
  e.team_id,
  -- Overall
  count(*) filter (where e.sub_type in ('save','goal_conceded'))                    as shots_faced,
  count(*) filter (where e.sub_type = 'save')                                       as saves,
  count(*) filter (where e.sub_type = 'goal_conceded')                              as goals_conceded,
  round(
    count(*) filter (where e.sub_type = 'save')::numeric
    / nullif(count(*) filter (where e.sub_type in ('save','goal_conceded')), 0) * 100
  , 1)                                                                               as save_pct,
  -- By shot_range (read directly from the GOALKEEPER_ACTION event)
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.shot_range = 'penalty')        as faced_penalty,
  count(*) filter (where e.sub_type = 'save'         and e.shot_range = 'penalty')                  as saved_penalty,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.shot_range = 'corner_wing')    as faced_corner,
  count(*) filter (where e.sub_type = 'save'         and e.shot_range = 'corner_wing')              as saved_corner,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.shot_range = '9m_plus')        as faced_9m_plus,
  count(*) filter (where e.sub_type = 'save'         and e.shot_range = '9m_plus')                  as saved_9m_plus,
  count(*) filter (where e.sub_type = 'goal_conceded' and e.shot_range = '9m_plus')                 as goals_9m_plus,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.shot_range = '7_8m')           as faced_7_8m,
  count(*) filter (where e.sub_type = 'save'         and e.shot_range = '7_8m')                     as saved_7_8m,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.shot_range = '6m')             as faced_6m,
  count(*) filter (where e.sub_type = 'save'         and e.shot_range = '6m')                       as saved_6m,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.shot_range = 'line')           as faced_line,
  count(*) filter (where e.sub_type = 'save'         and e.shot_range = 'line')                     as saved_line,
  -- By phase_type
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.phase_type = 'set_play')       as faced_set_play,
  count(*) filter (where e.sub_type = 'save'         and e.phase_type = 'set_play')                 as saved_set_play,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.phase_type = 'fast_break')     as faced_fast_break,
  count(*) filter (where e.sub_type = 'save'         and e.phase_type = 'fast_break')               as saved_fast_break,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.phase_type = 'second_wave')    as faced_second_wave,
  count(*) filter (where e.sub_type = 'save'         and e.phase_type = 'second_wave')              as saved_second_wave,
  -- By numerical_state
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.numerical_state = '6v6')       as faced_6v6,
  count(*) filter (where e.sub_type = 'save'         and e.numerical_state = '6v6')                 as saved_6v6,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.numerical_state = 'inferiority') as faced_inferiority,
  count(*) filter (where e.sub_type = 'save'         and e.numerical_state = 'inferiority')         as saved_inferiority,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.numerical_state = 'superiority') as faced_superiority,
  count(*) filter (where e.sub_type = 'save'         and e.numerical_state = 'superiority')         as saved_superiority,
  count(*) filter (where e.sub_type in ('save','goal_conceded') and e.numerical_state = '6v7')       as faced_6v7,
  count(*) filter (where e.sub_type = 'save'         and e.numerical_state = '6v7')                 as saved_6v7,
  -- Phase stats (manual button taps)
  count(*) filter (where e.sub_type = 'empty_phase')                                                 as empty_phases,
  count(*) filter (where e.sub_type = 'positive_response')                                           as positive_responses
from events e
where e.event_type = 'GOALKEEPER_ACTION'
  and e.player_id is not null
  and e.is_voided = false
  and e.is_edited = false
group by e.player_id, e.match_id, e.team_id;
