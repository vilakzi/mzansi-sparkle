-- =====================================================
-- Muted users: hide content from muted accounts in feed
-- (softer than block — mutual follows still work)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.muted_users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  muter_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (muter_id, muted_id),
  CHECK (muter_id <> muted_id)
);

ALTER TABLE public.muted_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own mutes"
  ON public.muted_users FOR ALL
  USING (auth.uid() = muter_id)
  WITH CHECK (auth.uid() = muter_id);

CREATE INDEX IF NOT EXISTS idx_muted_users_muter ON public.muted_users(muter_id);
