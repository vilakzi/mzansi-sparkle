-- Fix critical security issues: Storage exposure and privacy settings enforcement

-- =====================================================
-- 1. MAKE STORAGE BUCKET PRIVATE
-- =====================================================
UPDATE storage.buckets 
SET public = false 
WHERE name = 'posts-media';

-- =====================================================
-- 2. STORAGE RLS POLICIES (Drop existing first)
-- =====================================================

-- Drop any existing storage policies for posts-media
DROP POLICY IF EXISTS "Users can upload their own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own media" ON storage.objects;
DROP POLICY IF EXISTS "Media access respects privacy settings" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view media" ON storage.objects;
DROP POLICY IF EXISTS "Public media access" ON storage.objects;

-- Allow viewing media for public posts or if user is owner/follower
CREATE POLICY "Media access respects privacy settings"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'posts-media'
  AND (
    -- Post owner can always see their media
    EXISTS (
      SELECT 1 FROM posts p
      WHERE p.media_url LIKE '%' || storage.objects.name || '%'
      AND p.user_id = auth.uid()
    )
    OR
    -- Public accounts (not private) - anyone can view
    EXISTS (
      SELECT 1 FROM posts p
      LEFT JOIN privacy_settings ps ON ps.user_id = p.user_id
      WHERE p.media_url LIKE '%' || storage.objects.name || '%'
      AND (ps.is_private IS NULL OR ps.is_private = false)
      AND NOT is_blocked(auth.uid(), p.user_id)
    )
    OR
    -- Private accounts - only followers can view
    EXISTS (
      SELECT 1 FROM posts p
      INNER JOIN privacy_settings ps ON ps.user_id = p.user_id
      INNER JOIN follows f ON f.following_id = p.user_id
      WHERE p.media_url LIKE '%' || storage.objects.name || '%'
      AND ps.is_private = true
      AND f.follower_id = auth.uid()
      AND NOT is_blocked(auth.uid(), p.user_id)
    )
  )
);

-- Users can upload their own media
CREATE POLICY "Users can upload their own media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'posts-media'
  AND auth.uid() IS NOT NULL
);

-- Users can delete their own media
CREATE POLICY "Users can delete their own media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'posts-media'
  AND EXISTS (
    SELECT 1 FROM posts p
    WHERE p.media_url LIKE '%' || storage.objects.name || '%'
    AND p.user_id = auth.uid()
  )
);

-- =====================================================
-- 3. UPDATE POSTS RLS TO RESPECT PRIVACY SETTINGS
-- =====================================================

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON posts;
DROP POLICY IF EXISTS "Posts visibility respects privacy and blocking" ON posts;

-- Create new policy that respects privacy settings
CREATE POLICY "Posts visibility respects privacy and blocking"
ON posts FOR SELECT
USING (
  -- Post owner can always see their own posts
  user_id = auth.uid()
  OR
  -- Public accounts (not private) - anyone can view except blocked users
  (
    NOT EXISTS (
      SELECT 1 FROM privacy_settings ps
      WHERE ps.user_id = posts.user_id 
      AND ps.is_private = true
    )
    AND NOT is_blocked(auth.uid(), posts.user_id)
  )
  OR
  -- Private accounts - only followers can view
  (
    EXISTS (
      SELECT 1 FROM privacy_settings ps
      WHERE ps.user_id = posts.user_id 
      AND ps.is_private = true
    )
    AND EXISTS (
      SELECT 1 FROM follows f
      WHERE f.following_id = posts.user_id 
      AND f.follower_id = auth.uid()
    )
    AND NOT is_blocked(auth.uid(), posts.user_id)
  )
);

-- =====================================================
-- 4. UPDATE COMMENTS RLS TO RESPECT PRIVACY AND BLOCKING
-- =====================================================

-- Drop existing comment policies
DROP POLICY IF EXISTS "Users can create comments" ON comments;
DROP POLICY IF EXISTS "Users can create comments with restrictions" ON comments;
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
DROP POLICY IF EXISTS "Comments viewable with blocking check" ON comments;

-- Create new policy that checks comment restrictions and blocking
CREATE POLICY "Users can create comments with restrictions"
ON comments FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND
  -- Check if the post owner allows comments
  EXISTS (
    SELECT 1 FROM posts p
    LEFT JOIN privacy_settings ps ON ps.user_id = p.user_id
    WHERE p.id = post_id
    -- Check comment restrictions
    AND (
      -- No privacy settings means comments allowed
      ps.who_can_comment IS NULL 
      OR ps.who_can_comment = 'everyone'
      -- Followers only
      OR (
        ps.who_can_comment = 'followers'
        AND EXISTS (
          SELECT 1 FROM follows f
          WHERE f.following_id = p.user_id
          AND f.follower_id = auth.uid()
        )
      )
      -- Owner always can comment on their own posts
      OR p.user_id = auth.uid()
    )
    -- Check blocking
    AND NOT is_blocked(auth.uid(), p.user_id)
  )
);

-- Update comment SELECT to respect blocking
CREATE POLICY "Comments viewable with blocking check"
ON comments FOR SELECT
USING (
  -- Can see comments if can see the post
  EXISTS (
    SELECT 1 FROM posts p
    WHERE p.id = comments.post_id
    AND (
      -- Own posts
      p.user_id = auth.uid()
      OR
      -- Public posts not blocked
      (
        NOT EXISTS (
          SELECT 1 FROM privacy_settings ps
          WHERE ps.user_id = p.user_id AND ps.is_private = true
        )
        AND NOT is_blocked(auth.uid(), p.user_id)
      )
      OR
      -- Private posts if following
      (
        EXISTS (
          SELECT 1 FROM privacy_settings ps
          WHERE ps.user_id = p.user_id AND ps.is_private = true
        )
        AND EXISTS (
          SELECT 1 FROM follows f
          WHERE f.following_id = p.user_id AND f.follower_id = auth.uid()
        )
        AND NOT is_blocked(auth.uid(), p.user_id)
      )
    )
  )
);

-- =====================================================
-- 5. UPDATE FOLLOWS TO PREVENT BLOCKING
-- =====================================================

-- Drop existing follow policies
DROP POLICY IF EXISTS "Users can follow others" ON follows;
DROP POLICY IF EXISTS "Users can follow non-blocked users" ON follows;
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON follows;
DROP POLICY IF EXISTS "Follows viewable except blocked" ON follows;

-- Create new policy that prevents following blocked users
CREATE POLICY "Users can follow non-blocked users"
ON follows FOR INSERT
WITH CHECK (
  auth.uid() = follower_id
  AND NOT is_blocked(follower_id, following_id)
);

-- Update follow SELECT to hide blocked relationships
CREATE POLICY "Follows viewable except blocked"
ON follows FOR SELECT
USING (
  NOT is_blocked(auth.uid(), follower_id)
  AND NOT is_blocked(auth.uid(), following_id)
);

-- =====================================================
-- 6. ADD ANALYTICS POLICIES
-- =====================================================

-- Drop existing analytics policies if any
DROP POLICY IF EXISTS "Post owners can view their post analytics" ON post_views;
DROP POLICY IF EXISTS "Users can view their own viewing history" ON post_views;
DROP POLICY IF EXISTS "Users can view shares of their posts" ON post_shares;

-- Allow post owners to view their post analytics
CREATE POLICY "Post owners can view their post analytics"
ON post_views FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM posts 
    WHERE posts.id = post_views.post_id 
    AND posts.user_id = auth.uid()
  )
);

-- Allow viewing own view history
CREATE POLICY "Users can view their own viewing history"
ON post_views FOR SELECT
USING (user_id = auth.uid());

-- Allow viewing shares of own posts
CREATE POLICY "Users can view shares of their posts"
ON post_shares FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM posts 
    WHERE posts.id = post_shares.post_id 
    AND posts.user_id = auth.uid()
  )
  OR user_id = auth.uid()
);