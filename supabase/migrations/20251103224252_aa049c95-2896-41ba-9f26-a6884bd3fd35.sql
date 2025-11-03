-- Phase 1: Create seen posts tracking table
CREATE TABLE IF NOT EXISTS public.user_seen_posts (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  last_seen_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS idx_user_seen_posts_user ON public.user_seen_posts(user_id, last_seen_at DESC);

-- Enable RLS
ALTER TABLE public.user_seen_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own seen posts"
ON public.user_seen_posts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own seen posts"
ON public.user_seen_posts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own seen posts"
ON public.user_seen_posts FOR UPDATE
USING (auth.uid() = user_id);

-- Phase 1.2: Drop and recreate get_feed_optimized with smart rotation
DROP FUNCTION IF EXISTS public.get_feed_optimized(uuid, text, integer, integer);

CREATE FUNCTION public.get_feed_optimized(
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
STABLE SECURITY DEFINER
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
    -- For You feed: Smart rotation with unseen posts priority
    RETURN QUERY
    WITH eligible_posts AS (
      SELECT 
        p.*,
        prof.*,
        -- Prioritize unseen posts
        CASE WHEN NOT EXISTS(
          SELECT 1 FROM user_seen_posts 
          WHERE user_id = p_user_id AND post_id = p.id
        ) THEN 0 ELSE 1 END as seen_priority,
        -- Time-based freshness score
        CASE
          WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 1
          WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 2
          WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 3
          ELSE 4
        END as time_bucket
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
    )
    SELECT 
      ep.id,
      ep.user_id,
      ep.media_url,
      ep.media_type,
      ep.caption,
      ep.likes_count,
      ep.comments_count,
      ep.views_count,
      ep.shares_count,
      ep.saves_count,
      ep.created_at,
      ep.username,
      ep.display_name,
      ep.avatar_url,
      ep.bio,
      ep.followers_count,
      ep.following_count,
      EXISTS(SELECT 1 FROM post_likes WHERE post_id = ep.id AND user_id = p_user_id) as is_liked,
      EXISTS(SELECT 1 FROM saved_posts WHERE post_id = ep.id AND user_id = p_user_id) as is_saved
    FROM eligible_posts ep
    ORDER BY 
      ep.seen_priority,  -- Unseen posts first
      ep.time_bucket,    -- Then newer posts
      RANDOM()           -- Then randomize within bucket
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
END;
$function$;

-- Phase 3: Create function to get new posts since timestamp
CREATE OR REPLACE FUNCTION public.get_new_posts_since(
  p_user_id uuid,
  p_feed_type text,
  p_since timestamptz,
  p_limit integer DEFAULT 20
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
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_feed_type = 'following' THEN
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
    AND p.created_at > p_since
    ORDER BY p.created_at DESC
    LIMIT p_limit;
  ELSE
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
    AND p.created_at > p_since
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
    ORDER BY p.created_at DESC
    LIMIT p_limit;
  END IF;
END;
$function$;