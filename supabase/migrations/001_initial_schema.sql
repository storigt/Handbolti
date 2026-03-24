-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Seasons ──────────────────────────────────────────────────────────────────
create table seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  start_date date,
  end_date   date,
  created_at timestamptz not null default now()
);

-- ─── Competitions ─────────────────────────────────────────────────────────────
create table competitions (
  id        uuid primary key default gen_random_uuid(),
  season_id uuid references seasons(id) on delete cascade,
  name      text not null,
  level     text not null check (level in ('league', 'cup', 'friendly')),
  created_at timestamptz not null default now()
);

-- ─── Teams ────────────────────────────────────────────────────────────────────
create table teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text,
  home_venue  text,
  created_at  timestamptz not null default now()
);

-- ─── Players ──────────────────────────────────────────────────────────────────
create table players (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams(id) on delete cascade,
  first_name     text not null,
  last_name      text not null,
  jersey_number  smallint,
  position       text not null check (position in ('goalkeeper', 'field')),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index players_team_id_idx on players(team_id);

-- ─── Matches ──────────────────────────────────────────────────────────────────
create table matches (
  id               uuid primary key default gen_random_uuid(),
  competition_id   uuid references competitions(id) on delete set null,
  home_team_id     uuid not null references teams(id),
  away_team_id     uuid not null references teams(id),
  match_date       timestamptz,
  venue            text,
  status           text not null default 'planned'
                     check (status in ('planned', 'in_progress', 'final')),
  -- denormalized scores: only written on match finalization, not used for analysis
  home_score       smallint,
  away_score       smallint,
  tracked_team_id  uuid not null references teams(id),
  notes            text,
  created_at       timestamptz not null default now()
);

create index matches_competition_id_idx on matches(competition_id);
create index matches_status_idx on matches(status);
create index matches_match_date_idx on matches(match_date desc);

-- ─── Rosters ──────────────────────────────────────────────────────────────────
create table rosters (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid not null references matches(id) on delete cascade,
  player_id        uuid not null references players(id),
  team_id          uuid not null references teams(id),
  jersey_override  smallint,
  is_starter       boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (match_id, player_id)
);

create index rosters_match_id_idx on rosters(match_id);

-- ─── Events ───────────────────────────────────────────────────────────────────
-- Append-only. Never hard-delete. Undo = set is_voided = true.
create table events (
  id            uuid primary key,           -- client-generated UUID
  client_id     text not null unique,       -- idempotency key (same as id as text)
  match_id      uuid not null references matches(id),
  period        smallint not null,
  -- match_clock: seconds elapsed in period (stored as integer for easier querying)
  match_clock   integer,                    -- seconds from period start
  wall_clock    timestamptz not null,       -- tapped_at on client, used for ordering after sync
  team_id       uuid not null references teams(id),
  player_id     uuid references players(id),
  event_type    text not null check (event_type in (
                  'SHOT', 'TURNOVER', 'SUSPENSION', 'FOUL',
                  'GOALKEEPER_ACTION', 'TIMEOUT', 'PERIOD_MARKER'
                )),
  sub_type      text,
  situation     text check (situation in (
                  'set_offense', 'fast_break', '7m_penalty',
                  'counter_attack', 'breakthrough'
                )),
  zone          smallint check (zone between 1 and 10),
  context       jsonb not null default '{}',
  -- soft delete / revision fields
  is_voided     boolean not null default false,
  void_reason   text,
  voided_at     timestamptz,
  voided_by     uuid references auth.users(id),
  is_edited     boolean not null default false,
  replaced_by   uuid references events(id),   -- points to correcting event
  original_id   uuid references events(id),   -- if this IS a correction
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  synced_at     timestamptz                    -- set by server on receipt
);

create index events_match_id_idx on events(match_id);
create index events_match_id_type_idx on events(match_id, event_type)
  where is_voided = false and is_edited = false;
create index events_wall_clock_idx on events(match_id, wall_clock);
create index events_player_id_idx on events(player_id)
  where player_id is not null;

-- ─── Event Links ──────────────────────────────────────────────────────────────
-- Relates two events causally (e.g., save ↔ shot, assist ↔ goal)
create table event_links (
  id                uuid primary key default gen_random_uuid(),
  match_id          uuid not null references matches(id),
  primary_event_id  uuid not null references events(id),
  linked_event_id   uuid not null references events(id),
  link_type         text not null check (link_type in (
                      'goalkeeper_response', 'assist', 'caused_by'
                    )),
  created_at        timestamptz not null default now()
);

create index event_links_primary_event_idx on event_links(primary_event_id);
create index event_links_linked_event_idx on event_links(linked_event_id);

-- ─── API Feed Sources (Phase 2 — created now to avoid migration later) ────────
create table api_feed_sources (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  base_url       text,
  auth_config    jsonb,   -- store encrypted credentials
  last_polled_at timestamptz,
  created_at     timestamptz not null default now()
);

-- ─── API Feed Log (Phase 2) ───────────────────────────────────────────────────
create table api_feed_log (
  id                uuid primary key default gen_random_uuid(),
  source_id         uuid references api_feed_sources(id),
  match_id          uuid references matches(id),
  raw_payload       jsonb not null,  -- original feed data, never discarded
  mapped_event_id   uuid references events(id),
  ingested_at       timestamptz not null default now(),
  status            text not null check (status in ('success', 'mapping_error', 'duplicate'))
);

create index api_feed_log_match_id_idx on api_feed_log(match_id);

-- ─── Row Level Security ───────────────────────────────────────────────────────
alter table seasons          enable row level security;
alter table competitions     enable row level security;
alter table teams            enable row level security;
alter table players          enable row level security;
alter table matches          enable row level security;
alter table rosters          enable row level security;
alter table events           enable row level security;
alter table event_links      enable row level security;
alter table api_feed_sources enable row level security;
alter table api_feed_log     enable row level security;

-- Read: any authenticated user can read everything
create policy "Authenticated read all"
  on seasons for select to authenticated using (true);
create policy "Authenticated read all"
  on competitions for select to authenticated using (true);
create policy "Authenticated read all"
  on teams for select to authenticated using (true);
create policy "Authenticated read all"
  on players for select to authenticated using (true);
create policy "Authenticated read all"
  on matches for select to authenticated using (true);
create policy "Authenticated read all"
  on rosters for select to authenticated using (true);
create policy "Authenticated read all"
  on events for select to authenticated using (true);
create policy "Authenticated read all"
  on event_links for select to authenticated using (true);

-- Write: only users with role 'operator' or 'admin' can insert/update
-- For MVP we keep it simple: any authenticated user can write.
-- Tighten this with user roles in Phase 2.
create policy "Authenticated insert events"
  on events for insert to authenticated with check (true);
create policy "Authenticated update events"
  on events for update to authenticated using (true);

create policy "Authenticated write rosters"
  on rosters for all to authenticated using (true) with check (true);
create policy "Authenticated write matches"
  on matches for all to authenticated using (true) with check (true);
create policy "Authenticated write teams"
  on teams for all to authenticated using (true) with check (true);
create policy "Authenticated write players"
  on players for all to authenticated using (true) with check (true);
create policy "Authenticated write seasons"
  on seasons for all to authenticated using (true) with check (true);
create policy "Authenticated write competitions"
  on competitions for all to authenticated using (true) with check (true);
create policy "Authenticated write event_links"
  on event_links for all to authenticated using (true) with check (true);
