-- 010_auth.sql
-- Add team ownership and tighten RLS so each user only sees their own data.
-- owner_user_id is nullable so existing anonymous-auth data is not broken.

-- ─── Add owner to teams ───────────────────────────────────────────────────────

ALTER TABLE teams ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id);

-- ─── teams ────────────────────────────────────────────────────────────────────
-- Read stays open (opponent team names are not sensitive, needed for match display)
-- Write is restricted: only the owner can modify their team

DROP POLICY IF EXISTS "Authenticated read all" ON teams;
DROP POLICY IF EXISTS "Authenticated write teams" ON teams;

CREATE POLICY "teams_read" ON teams
  FOR SELECT TO authenticated USING (true);

-- Own teams require owner match; opponent teams (owner_user_id IS NULL) are allowed for anyone
CREATE POLICY "teams_insert" ON teams
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "teams_update" ON teams
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

CREATE POLICY "teams_delete" ON teams
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR owner_user_id IS NULL);

-- ─── players ─────────────────────────────────────────────────────────────────
-- Only readable/writable for the team owner.
-- owner_user_id IS NULL allows legacy anonymous-created teams to still work.

DROP POLICY IF EXISTS "Authenticated read all" ON players;
DROP POLICY IF EXISTS "Authenticated write players" ON players;

CREATE POLICY "players_read" ON players
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = players.team_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );

CREATE POLICY "players_write" ON players
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = players.team_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = players.team_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );

-- ─── matches ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated read all" ON matches;
DROP POLICY IF EXISTS "Authenticated write matches" ON matches;

CREATE POLICY "matches_read" ON matches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = matches.tracked_team_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );

CREATE POLICY "matches_write" ON matches
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = matches.tracked_team_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = matches.tracked_team_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );

-- ─── events ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated read all" ON events;
DROP POLICY IF EXISTS "Authenticated insert events" ON events;
DROP POLICY IF EXISTS "Authenticated update events" ON events;

CREATE POLICY "events_read" ON events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      JOIN teams ON teams.id = matches.tracked_team_id
      WHERE matches.id = events.match_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );

CREATE POLICY "events_insert" ON events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      JOIN teams ON teams.id = matches.tracked_team_id
      WHERE matches.id = events.match_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );

CREATE POLICY "events_update" ON events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      JOIN teams ON teams.id = matches.tracked_team_id
      WHERE matches.id = events.match_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );

-- ─── rosters ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated read all" ON rosters;
DROP POLICY IF EXISTS "Authenticated write rosters" ON rosters;

CREATE POLICY "rosters_all" ON rosters
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      JOIN teams ON teams.id = matches.tracked_team_id
      WHERE matches.id = rosters.match_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      JOIN teams ON teams.id = matches.tracked_team_id
      WHERE matches.id = rosters.match_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );

-- ─── event_links ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated read all" ON event_links;
DROP POLICY IF EXISTS "Authenticated write event_links" ON event_links;

CREATE POLICY "event_links_all" ON event_links
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      JOIN teams ON teams.id = matches.tracked_team_id
      WHERE matches.id = event_links.match_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches
      JOIN teams ON teams.id = matches.tracked_team_id
      WHERE matches.id = event_links.match_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );
