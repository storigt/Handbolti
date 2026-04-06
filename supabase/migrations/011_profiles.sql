-- 011_profiles.sql
-- User profiles + admin system + account approval flow.

-- ─── admins table ─────────────────────────────────────────────────────────────
-- Manually populated via Supabase dashboard for the first admin.
-- Admins can then promote others via the admin UI.

CREATE TABLE admins (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can check if someone is admin (needed for UI checks)
CREATE POLICY "admins_read" ON admins
  FOR SELECT TO authenticated USING (true);

-- Only existing admins can add other admins
CREATE POLICY "admins_insert" ON admins
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

CREATE POLICY "admins_delete" ON admins
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ─── profiles table ───────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL DEFAULT '',
  is_approved BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_own_read" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Admins can read and update all profiles
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid()));

-- ─── Auto-create profile on signup ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, is_approved)
  VALUES (NEW.id, COALESCE(NEW.email, ''), false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
