-- Phase 1.1: Add Critical Database Indexes for Performance
-- These indexes will dramatically improve query performance

-- Composite index for feed queries (user + created_at)
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);

-- Optimize likes lookup (most frequent query)
CREATE INDEX IF NOT EXISTS idx_post_likes_lookup ON post_likes(post_id, user_id);

-- Optimize saves lookup
CREATE INDEX IF NOT EXISTS idx_saved_posts_lookup ON saved_posts(post_id, user_id);

-- Optimize video tracking queries
CREATE INDEX IF NOT EXISTS idx_post_views_post_user ON post_views(post_id, user_id);

-- Optimize comments count queries
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at DESC);

-- Optimize profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(id);

-- Phase 1.2: Create Batch Post Enrichment Function
-- This function replaces 45+ separate queries with 1 query
CREATE OR REPLACE FUNCTION get_enriched_posts(
  p_user_id uuid,
  p_post_ids uuid[]
)
RETURNS TABLE (
  post_id uuid,
  user_liked boolean,
  user_saved boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id as post_id,
    EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = p_user_id) as user_liked,
    EXISTS(SELECT 1 FROM saved_posts WHERE post_id = p.id AND user_id = p_user_id) as user_saved
  FROM unnest(p_post_ids) AS p(id);
END;
$$;

-- Phase 1.3: Create Helper Function for RLS Optimization
CREATE OR REPLACE FUNCTION can_view_post(viewer_id uuid, post_owner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    viewer_id = post_owner_id OR
    (
      NOT EXISTS(SELECT 1 FROM blocked_users WHERE blocker_id = post_owner_id AND blocked_id = viewer_id) AND
      (
        NOT EXISTS(SELECT 1 FROM privacy_settings WHERE user_id = post_owner_id AND is_private = true) OR
        EXISTS(SELECT 1 FROM follows WHERE following_id = post_owner_id AND follower_id = viewer_id)
      )
    )
  );
END;
$$;