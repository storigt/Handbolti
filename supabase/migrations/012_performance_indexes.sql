-- 012_performance_indexes.sql
-- Indexes to speed up the ownership-check subqueries in RLS policies
-- and common dashboard/report query patterns.

-- RLS: events → matches lookup
CREATE INDEX IF NOT EXISTS idx_events_match_id ON events(match_id);

-- RLS: matches → tracked_team_id lookup
CREATE INDEX IF NOT EXISTS idx_matches_tracked_team_id ON matches(tracked_team_id);

-- RLS: teams → owner lookup
CREATE INDEX IF NOT EXISTS idx_teams_owner_user_id ON teams(owner_user_id);

-- RLS: players → team lookup
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players(team_id);

-- RLS: rosters → match lookup
CREATE INDEX IF NOT EXISTS idx_rosters_match_id ON rosters(match_id);

-- Dashboard: events filtered by type within a match
CREATE INDEX IF NOT EXISTS idx_events_match_type ON events(match_id, event_type) WHERE is_voided = false;

-- Dashboard: events by team within a match
CREATE INDEX IF NOT EXISTS idx_events_match_team ON events(match_id, team_id) WHERE is_voided = false;

-- Profiles: auth lookup
CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);
