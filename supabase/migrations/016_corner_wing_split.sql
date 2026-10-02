-- ─── Migration 016: Split corner/wing shot range into left and right ─────────
-- The live logger no longer offers a single "Horn" option; the operator picks
-- "Vinstra Horn" or "Hægra Horn" instead, in both the attack and the
-- goalkeeper shot flows.
--
-- 'corner_wing' is KEPT as a legal value: shots logged before this migration
-- never recorded a side, so dropping it would (a) lose that data and (b) make
-- this ALTER fail outright, because Postgres validates a new CHECK constraint
-- against existing rows. Client-side stats treat it as part of the combined
-- "Horn" total alongside the two new values.

alter table events drop constraint events_shot_range_check;
alter table events add constraint events_shot_range_check check (shot_range in (
  '6m',
  '7_8m',
  '9m_plus',
  'line',
  'penalty',
  'corner_wing',        -- legacy: side not recorded (pre-016 data only)
  'corner_wing_left',
  'corner_wing_right'
));
