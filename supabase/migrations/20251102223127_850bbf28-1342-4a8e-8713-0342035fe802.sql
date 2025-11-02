-- Phase 1: Remove Recommendation Algorithm
-- This removes all complex feed personalization features to restore performance

-- Drop expensive recommendation functions
DROP FUNCTION IF EXISTS public.get_personalized_feed(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_mixed_feed(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_shuffled_feed(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.update_user_interests_from_interaction(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_complete_feed_data(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_initial_feed_data(uuid);

-- Drop user interests and category tables
DROP TABLE IF EXISTS public.user_interests CASCADE;
DROP TABLE IF EXISTS public.post_category_mappings CASCADE;
DROP TABLE IF EXISTS public.post_categories CASCADE;

-- Drop message reactions (DM simplification - Phase 2)
DROP TABLE IF EXISTS public.message_reactions CASCADE;

-- Simplify post_views table - remove excessive tracking columns
ALTER TABLE IF EXISTS public.post_views 
  DROP COLUMN IF EXISTS session_id,
  DROP COLUMN IF EXISTS completion_rate,
  DROP COLUMN IF EXISTS watch_duration;

-- Create simple feed function for "For You" feed (time-bucketed shuffle)
CREATE OR REPLACE FUNCTION public.get_simple_feed(
  p_user_id uuid,
  p_feed_type text DEFAULT 'for-you',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  media_url text,
  media_type text,
  caption text,
  likes_count integer,
  comments_count integer,
  views_count integer,
  shares_count integer,
  saves_count integer,
  created_at timestamp with time zone,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  followers_count integer,
  following_count integer,
  is_liked boolean,
  is_saved boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_feed_type = 'following' THEN
    -- Following feed: posts from followed users
    RETURN QUERY
    SELECT 
      p.id,
      p.user_id,
      p.media_url,
      p.media_type,
      p.caption,
      p.likes_count,
      p.comments_count,
      p.views_count,
      p.shares_count,
      p.saves_count,
      p.created_at,
      prof.username,
      prof.display_name,
      prof.avatar_url,
      prof.bio,
      prof.followers_count,
      prof.following_count,
      EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = p_user_id) as is_liked,
      EXISTS(SELECT 1 FROM saved_posts WHERE post_id = p.id AND user_id = p_user_id) as is_saved
    FROM posts p
    JOIN profiles prof ON prof.id = p.user_id
    WHERE EXISTS(
      SELECT 1 FROM follows f 
      WHERE f.follower_id = p_user_id AND f.following_id = p.user_id
    )
    AND NOT is_blocked(p_user_id, p.user_id)
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    -- For You feed: simple time-bucketed random shuffle
    RETURN QUERY
    SELECT 
      p.id,
      p.user_id,
      p.media_url,
      p.media_type,
      p.caption,
      p.likes_count,
      p.comments_count,
      p.views_count,
      p.shares_count,
      p.saves_count,
      p.created_at,
      prof.username,
      prof.display_name,
      prof.avatar_url,
      prof.bio,
      prof.followers_count,
      prof.following_count,
      EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = p_user_id) as is_liked,
      EXISTS(SELECT 1 FROM saved_posts WHERE post_id = p.id AND user_id = p_user_id) as is_saved
    FROM posts p
    JOIN profiles prof ON prof.id = p.user_id
    WHERE p.user_id != p_user_id
    AND NOT is_blocked(p_user_id, p.user_id)
    AND (
      NOT EXISTS(
        SELECT 1 FROM privacy_settings ps 
        WHERE ps.user_id = p.user_id AND ps.is_private = true
      )
      OR EXISTS(
        SELECT 1 FROM follows f 
        WHERE f.following_id = p.user_id AND f.follower_id = p_user_id
      )
    )
    ORDER BY 
      CASE
        WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 1
        WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 2
        WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 3
        ELSE 4
      END,
      RANDOM()
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$$;

-- Add indexes for performance on simple queries
CREATE INDEX IF NOT EXISTS idx_posts_created_at_desc ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user_id_created_at ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_follows_follower_following ON follows(follower_id, following_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_post_user ON post_likes(post_id, user_id);
CREATE INDEX IF NOT EXISTS idx_saved_posts_post_user ON saved_posts(post_id, user_id);