-- 014_events_delete_policy.sql
-- Migration 010 added events_insert and events_update but missed events_delete.
-- Without this, deleteMatch fails: events can't be removed, then the match
-- delete hits a FK violation. Supabase silently swallows the events delete
-- (returns 0 rows affected), making the delete appear to do nothing.

CREATE POLICY "events_delete" ON events
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches
      JOIN teams ON teams.id = matches.tracked_team_id
      WHERE matches.id = events.match_id
        AND (teams.owner_user_id = auth.uid() OR teams.owner_user_id IS NULL)
    )
  );
