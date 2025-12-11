-- =====================================================
-- CRITICAL SECURITY FIX #1: Restrict WhatsApp number visibility
-- Only followers can see the whatsapp_number field
-- =====================================================

-- Create function to check if user follows another
CREATE OR REPLACE FUNCTION public.is_following(follower uuid, following uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = follower AND following_id = following
  )
$$;

-- Create a view that hides whatsapp_number from non-followers
CREATE OR REPLACE VIEW public.profiles_safe AS
SELECT 
  id,
  username,
  display_name,
  avatar_url,
  bio,
  followers_count,
  following_count,
  created_at,
  updated_at,
  username_updated_at,
  CASE 
    WHEN id = auth.uid() THEN whatsapp_number  -- Owner can see their own
    WHEN is_following(auth.uid(), id) THEN whatsapp_number  -- Followers can see
    ELSE NULL  -- Hide from everyone else
  END as whatsapp_number
FROM public.profiles;

-- =====================================================
-- CRITICAL SECURITY FIX #2: Restrict post_likes visibility
-- Users can only see their own likes, post owners can see who liked
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view post likes" ON public.post_likes;

CREATE POLICY "Users can view their own likes"
ON public.post_likes
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Post owners can view likes on their posts"
ON public.post_likes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.posts 
    WHERE posts.id = post_likes.post_id 
    AND posts.user_id = auth.uid()
  )
);

-- =====================================================
-- SECURITY FIX #3: Add INSERT policy for conversations
-- =====================================================

CREATE POLICY "Authenticated users can create conversations"
ON public.conversations
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- =====================================================
-- SECURITY FIX #4: Add INSERT policy for notifications (via trigger)
-- Notifications are created by triggers, not directly by users
-- =====================================================

-- Allow service role / triggers to insert notifications
CREATE POLICY "System can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- =====================================================
-- SECURITY FIX #5: Add write policies for hashtags (system managed)
-- =====================================================

CREATE POLICY "System can manage hashtags"
ON public.hashtags
FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update hashtags"
ON public.hashtags
FOR UPDATE
USING (true);

-- =====================================================
-- SECURITY FIX #6: Add write policies for post_hashtags
-- =====================================================

CREATE POLICY "Users can add hashtags to their posts"
ON public.post_hashtags
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.posts
    WHERE posts.id = post_hashtags.post_id
    AND posts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can remove hashtags from their posts"
ON public.post_hashtags
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.posts
    WHERE posts.id = post_hashtags.post_id
    AND posts.user_id = auth.uid()
  )
);

-- =====================================================
-- SECURITY FIX #7: Add admin policies for user_roles
-- =====================================================

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update roles"
ON public.user_roles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- =====================================================
-- INFO FIX #8: Add DELETE policy for upload_sessions
-- =====================================================

CREATE POLICY "Users can delete their own upload sessions"
ON public.upload_sessions
FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- INFO FIX #9: Add DELETE policy for post_shares
-- =====================================================

CREATE POLICY "Users can delete their own shares"
ON public.post_shares
FOR DELETE
USING (auth.uid() = user_id);

-- =====================================================
-- PERFORMANCE: Add indexes for common queries
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows(following_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user ON public.post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_seen_posts_composite ON public.user_seen_posts(user_id, post_id);