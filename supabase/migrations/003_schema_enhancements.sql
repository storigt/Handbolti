-- ─── Migration 003: Schema Enhancements ──────────────────────────────────────
-- Replaces `situation` with three orthogonal classification columns,
-- adds match_minute, expands event taxonomy, and introduces court lineup tracking.

-- ─── 1. Drop situation column (replaced by shot_range + phase_type + numerical_state) ──
-- CASCADE drops the 002 views that reference situation; migration 004 recreates them all.
alter table events drop column situation cascade;

-- ─── 2. Add match_minute ─────────────────────────────────────────────────────
-- Operator-set game minute. Not derived from match_clock — set manually in the UI.
alter table events add column match_minute smallint;

-- ─── 3. Add shot_range ───────────────────────────────────────────────────────
-- WHERE ON THE COURT the shot came from. Mutually exclusive.
-- Distinct from zone (1–9) which maps where in the goal the shot went.
alter table events add column shot_range text check (shot_range in (
  '6m',          -- close range (6m line)
  '7_8m',        -- medium range (7–8m)
  '9m_plus',     -- long range (beyond 9m)
  'line',        -- lína — pivot/line player
  'penalty',     -- víti — 7-meter penalty
  'corner_wing'  -- horn — wing/corner position
));

-- ─── 4. Add phase_type ───────────────────────────────────────────────────────
-- Phase of play. Mutually exclusive.
alter table events add column phase_type text check (phase_type in (
  'normal',       -- regular set offense (sókn)
  'fast_break',   -- hraðaupphlaup
  'second_wave'   -- seinni bylgja
));

-- ─── 5. Add numerical_state ──────────────────────────────────────────────────
-- Numerical advantage/disadvantage at time of event. Mutually exclusive.
-- Perspective is always from the tracked team.
alter table events add column numerical_state text check (numerical_state in (
  'equal',       -- jafntala — even numbers
  'inferiority', -- undirtala — tracked team has fewer players
  'superiority', -- yfirtala — tracked team has more players
  '7v6',         -- 7á6 — tracked team attacks with 7 field players (GK out)
  '6v7'          -- 6á7 — tracked team's GK faces 7 opponent field players
));

-- ─── 6. Expand event_type constraint ─────────────────────────────────────────
alter table events drop constraint events_event_type_check;
alter table events add constraint events_event_type_check check (event_type in (
  'SHOT',
  'TURNOVER',
  'SUSPENSION',
  'FOUL',
  'GOALKEEPER_ACTION',
  'TIMEOUT',
  'PERIOD_MARKER',
  'SUBSTITUTION',    -- player swap → triggers new court_lineup record
  'DEFENSIVE_ACTION' -- blocks, interceptions, 1v1 duels, high contact, protest
));

-- ─── 7. Expand event_links link_type constraint ───────────────────────────────
alter table event_links drop constraint event_links_link_type_check;
alter table event_links add constraint event_links_link_type_check check (link_type in (
  'goalkeeper_response',
  'assist',
  'caused_by',
  'penalty_assist'  -- víta sending: player who earned the penalty
));

-- ─── 8. court_lineups table ──────────────────────────────────────────────────
-- Snapshot of which players are on court at a given moment.
-- Created at match start (starters) and on every SUBSTITUTION event.
create table court_lineups (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches(id) on delete cascade,
  period       smallint not null,
  match_minute smallint not null,
  player_ids   uuid[] not null,  -- player IDs currently on court
  created_at   timestamptz not null default now()
);

create index court_lineups_match_id_idx on court_lineups(match_id);

alter table court_lineups enable row level security;
create policy "Authenticated read all"
  on court_lineups for select to authenticated using (true);
create policy "Authenticated write court_lineups"
  on court_lineups for all to authenticated using (true) with check (true);

-- ─── 9. Add lineup_id to events ──────────────────────────────────────────────
-- References the active court lineup when this event was logged.
-- Nullable: PERIOD_MARKER events and legacy data won't have a lineup.
alter table events add column lineup_id uuid references court_lineups(id);

-- ─── 10. Indexes ─────────────────────────────────────────────────────────────
create index events_lineup_id_idx
  on events(lineup_id) where lineup_id is not null;

create index events_match_shot_range_idx
  on events(match_id, shot_range)
  where is_voided = false and is_edited = false;

create index events_match_phase_type_idx
  on events(match_id, phase_type)
  where is_voided = false and is_edited = false;

create index events_match_numerical_state_idx
  on events(match_id, numerical_state)
  where is_voided = false and is_edited = false;

create index events_match_minute_idx
  on events(match_id, match_minute)
  where is_voided = false and is_edited = false;
