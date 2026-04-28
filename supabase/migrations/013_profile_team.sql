-- 013_profile_team.sql
-- Store tracked_team_id on the profile so team membership follows the user
-- across devices and browsers (localStorage alone is not cross-device).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tracked_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Allow users to update their own profile row (needed to persist tracked_team_id).
-- The check restricts the update to the user's own row.
CREATE POLICY "profiles_own_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
