-- 018: Per-account index settings (custom indices, edited formulas, colour limits).
-- Settings only: one JSON document per user. Indices are always computed from
-- events in the app, so nothing here touches or changes match data.

CREATE TABLE IF NOT EXISTS index_settings (
  user_id    UUID PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  config     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE index_settings ENABLE ROW LEVEL SECURITY;

-- Each account reads and writes only its own row
CREATE POLICY "index_settings_own" ON index_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
