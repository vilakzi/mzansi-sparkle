-- Fix the get_feed_optimized function with ambiguous user_id references
-- This resolves the "column reference is ambiguous" errors
CREATE OR REPLACE FUNCTION public.get_feed_optimized(
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
  user_liked boolean,
  user_saved boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as user_liked,
      EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as user_saved
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
    -- For You feed: time-bucketed random shuffle
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
      EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as user_liked,
      EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as user_saved
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
$function$;