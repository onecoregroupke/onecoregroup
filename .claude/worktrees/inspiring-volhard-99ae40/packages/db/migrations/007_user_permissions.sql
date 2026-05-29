-- Migration 007: User permissions table for role-based access control
-- Each invited user gets a row. No row = founding admin (full access).

CREATE TABLE IF NOT EXISTS user_permissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  -- JSONB map of section → 'none' | 'view' | 'edit'
  -- e.g. {"dashboard":"view","glitz":"edit","compliance":"none"}
  permissions  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Authenticated users can read their own row (used by client-side layout)
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own permissions"
  ON user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_permissions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_user_permissions_updated_at
  BEFORE UPDATE ON user_permissions
  FOR EACH ROW EXECUTE FUNCTION update_user_permissions_updated_at();
