-- ─── Migration 007: Attack counter events ────────────────────────────────────
-- Adds ATTACK event type so the operator can tap a button per attack for each
-- team. team_id distinguishes tracked team vs opponent.
-- All downstream stats (attacks per team, per minute, per lineup) are derived
-- from counting events WHERE event_type = 'ATTACK'.

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
  'ATTACKING_ACTION',
  'ATTACK'              -- possession / attack counter (both teams)
));

-- ─── View: attack counts per team per match ───────────────────────────────────
create view v_attack_counts as
select
  match_id,
  team_id,
  count(*)                                             as total_attacks,
  count(*) filter (where match_minute is not null)     as attacks_with_minute
from events
where event_type = 'ATTACK'
  and is_voided = false
  and is_edited = false
group by match_id, team_id;
