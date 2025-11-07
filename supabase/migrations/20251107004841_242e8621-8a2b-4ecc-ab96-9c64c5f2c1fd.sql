-- Create hybrid feed algorithm function
-- Mixes 70% following, 20% trending, 10% discovery posts

CREATE OR REPLACE FUNCTION public.get_hybrid_feed(
  p_user_id uuid,
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
  feed_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_following_count integer;
  v_trending_count integer;
  v_discovery_count integer;
  v_total_following integer;
BEGIN
  -- Calculate how many posts to fetch from each category based on ratios
  v_following_count := CEIL(p_limit * 0.7); -- 70% following
  v_trending_count := CEIL(p_limit * 0.2);  -- 20% trending
  v_discovery_count := p_limit - v_following_count - v_trending_count; -- 10% discovery
  
  -- Check if user follows anyone
  SELECT COUNT(*) INTO v_total_following
  FROM follows
  WHERE follower_id = p_user_id;
  
  -- If user doesn't follow anyone, adjust ratios (more trending + discovery)
  IF v_total_following = 0 THEN
    v_following_count := 0;
    v_trending_count := CEIL(p_limit * 0.6);  -- 60% trending
    v_discovery_count := p_limit - v_trending_count; -- 40% discovery
  END IF;

  RETURN QUERY
  WITH following_posts AS (
    -- Get posts from followed users (70%)
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
      'following'::text as feed_type
    FROM posts p
    WHERE p.user_id IN (
      SELECT following_id FROM follows WHERE follower_id = p_user_id
    )
    AND NOT is_blocked(p_user_id, p.user_id)
    ORDER BY p.created_at DESC
    LIMIT v_following_count
  ),
  trending_posts AS (
    -- Get trending posts based on engagement (20%)
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
      'trending'::text as feed_type
    FROM posts p
    WHERE p.created_at > NOW() - INTERVAL '7 days'
    AND p.user_id != p_user_id
    AND NOT is_blocked(p_user_id, p.user_id)
    AND p.id NOT IN (SELECT id FROM following_posts)
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
    ORDER BY (p.likes_count * 3 + p.comments_count * 2 + p.shares_count * 4 + p.views_count)::bigint DESC
    LIMIT v_trending_count
  ),
  discovery_posts AS (
    -- Get random discovery posts (10%)
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
      'discovery'::text as feed_type
    FROM posts p
    WHERE p.user_id != p_user_id
    AND NOT is_blocked(p_user_id, p.user_id)
    AND p.id NOT IN (SELECT id FROM following_posts)
    AND p.id NOT IN (SELECT id FROM trending_posts)
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
    ORDER BY RANDOM()
    LIMIT v_discovery_count
  ),
  combined_feed AS (
    SELECT * FROM following_posts
    UNION ALL
    SELECT * FROM trending_posts
    UNION ALL
    SELECT * FROM discovery_posts
  )
  SELECT 
    c.id,
    c.user_id,
    c.media_url,
    c.media_type,
    c.caption,
    c.likes_count,
    c.comments_count,
    c.views_count,
    c.shares_count,
    c.saves_count,
    c.created_at,
    c.feed_type
  FROM combined_feed c
  ORDER BY 
    -- Shuffle within each batch while maintaining category ratios
    CASE c.feed_type
      WHEN 'following' THEN 1
      WHEN 'trending' THEN 2
      WHEN 'discovery' THEN 3
    END,
    RANDOM()
  OFFSET p_offset
  LIMIT p_limit;
END;
$function$;