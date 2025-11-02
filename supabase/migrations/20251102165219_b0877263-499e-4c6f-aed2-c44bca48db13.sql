-- Drop and recreate the personalized feed function with improvements
DROP FUNCTION IF EXISTS public.get_personalized_feed(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_personalized_feed(
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
  recommendation_score numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH user_viewed_posts AS (
    -- Get posts user viewed in last 7 days to reduce repeats
    SELECT DISTINCT post_id
    FROM post_views
    WHERE user_id = p_user_id 
    AND viewed_at > NOW() - INTERVAL '7 days'
  ),
  scored_posts AS (
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
      (
        -- Base engagement score
        (p.likes_count * 3 + p.comments_count * 5 + p.saves_count * 7 + p.shares_count * 10)::NUMERIC +
        
        -- View quality score
        COALESCE(
          (SELECT AVG(pv.completion_rate) * p.views_count * 2 
           FROM post_views pv 
           WHERE pv.post_id = p.id), 
          0
        ) +
        
        -- Recency boost (posts from last 7 days get extra boost)
        CASE 
          WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 
            GREATEST(0, 150 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600)::NUMERIC
          WHEN p.created_at > NOW() - INTERVAL '30 days' THEN 50
          ELSE 25
        END +
        
        -- Interest match score
        COALESCE(
          (SELECT SUM(ui.interest_score * 25)
           FROM user_interests ui
           JOIN post_hashtags ph ON ph.hashtag_id = ui.hashtag_id
           WHERE ui.user_id = p_user_id AND ph.post_id = p.id),
          0
        ) +
        
        -- Following boost
        CASE WHEN EXISTS(
          SELECT 1 FROM follows f 
          WHERE f.follower_id = p_user_id AND f.following_id = p.user_id
        ) THEN 75 ELSE 0 END +
        
        -- Reduce score for recently viewed posts
        CASE WHEN EXISTS(
          SELECT 1 FROM user_viewed_posts uvp WHERE uvp.post_id = p.id
        ) THEN -100 ELSE 0 END +
        
        -- Diversity boost for posts from new creators
        CASE WHEN NOT EXISTS(
          SELECT 1 FROM post_views pv2
          JOIN posts p2 ON p2.id = pv2.post_id
          WHERE pv2.user_id = p_user_id AND p2.user_id = p.user_id
        ) THEN 30 ELSE 0 END
        
      ) AS recommendation_score
    FROM posts p
    WHERE 
      -- Don't show user's own posts
      p.user_id != p_user_id
      -- Respect privacy and blocking
      AND (
        (NOT EXISTS (
          SELECT 1 FROM privacy_settings ps 
          WHERE ps.user_id = p.user_id AND ps.is_private = true
        ))
        OR (
          EXISTS (
            SELECT 1 FROM privacy_settings ps 
            WHERE ps.user_id = p.user_id AND ps.is_private = true
          )
          AND EXISTS (
            SELECT 1 FROM follows f 
            WHERE f.following_id = p.user_id AND f.follower_id = p_user_id
          )
        )
      )
      AND NOT is_blocked(p_user_id, p.user_id)
  )
  SELECT 
    sp.id,
    sp.user_id,
    sp.media_url,
    sp.media_type,
    sp.caption,
    sp.likes_count,
    sp.comments_count,
    sp.views_count,
    sp.shares_count,
    sp.saves_count,
    sp.created_at,
    sp.recommendation_score
  FROM scored_posts sp
  ORDER BY sp.recommendation_score DESC, sp.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Create a function to get mixed feed content (trending + new + personalized)
CREATE OR REPLACE FUNCTION public.get_mixed_feed(
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
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH personalized AS (
    SELECT * FROM get_personalized_feed(p_user_id, p_limit * 2, p_offset)
  ),
  trending AS (
    SELECT * FROM get_trending_posts(10)
    WHERE id NOT IN (SELECT id FROM personalized)
  ),
  combined AS (
    SELECT 
      p.id, p.user_id, p.media_url, p.media_type, p.caption,
      p.likes_count, p.comments_count, p.views_count, p.shares_count, p.saves_count,
      p.created_at,
      1 as source_priority
    FROM personalized p
    UNION ALL
    SELECT 
      t.id, t.user_id, t.media_url, t.media_type, t.caption,
      t.likes_count, t.comments_count, t.views_count, 0 as shares_count, 0 as saves_count,
      t.created_at,
      2 as source_priority
    FROM trending t
  )
  SELECT 
    c.id, c.user_id, c.media_url, c.media_type, c.caption,
    c.likes_count, c.comments_count, c.views_count, c.shares_count, c.saves_count,
    c.created_at
  FROM combined c
  ORDER BY c.source_priority, c.created_at DESC
  LIMIT p_limit;
END;
$$;