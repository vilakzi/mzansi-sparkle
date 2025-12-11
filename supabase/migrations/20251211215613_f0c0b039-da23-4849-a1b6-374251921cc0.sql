-- =====================================================
-- FIX: Restrict hashtags to system-managed only
-- Only triggers can insert/update (not direct users)
-- =====================================================

DROP POLICY IF EXISTS "System can manage hashtags" ON public.hashtags;
DROP POLICY IF EXISTS "System can update hashtags" ON public.hashtags;

-- Hashtags are ONLY managed via the process_post_hashtags trigger
-- No direct user access needed

-- =====================================================
-- FIX: Require authentication for post_shares
-- =====================================================

DROP POLICY IF EXISTS "Anyone can create shares" ON public.post_shares;

CREATE POLICY "Authenticated users can create shares"
ON public.post_shares
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- =====================================================
-- FIX: Add indexes for better RLS performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_privacy_settings_user ON public.privacy_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_both ON public.blocked_users(blocker_id, blocked_id);