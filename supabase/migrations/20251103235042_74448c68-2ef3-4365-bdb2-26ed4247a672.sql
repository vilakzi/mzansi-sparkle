-- Fix get_feed_optimized to implement true infinite scroll with smart rotation
DROP FUNCTION IF EXISTS get_feed_optimized(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION get_feed_optimized(
  p_user_id uuid,
  p_feed_type text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  media_url text,
  media_type text,
  caption text,
  created_at timestamptz,
  likes_count bigint,
  comments_count bigint,
  shares_count bigint,
  saves_count bigint,
  views_count bigint,
  is_liked boolean,
  is_saved boolean,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  followers_count bigint,
  following_count bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_posts integer;
  v_adjusted_offset integer;
BEGIN
  -- Get total available posts count
  IF p_feed_type = 'following' THEN
    SELECT COUNT(*) INTO v_total_posts
    FROM posts p
    WHERE p.user_id IN (
      SELECT followed_id FROM follows WHERE follower_id = p_user_id
    );
  ELSE
    SELECT COUNT(*) INTO v_total_posts FROM posts;
  END IF;

  -- If we have no posts, return empty
  IF v_total_posts = 0 THEN
    RETURN;
  END IF;

  -- Implement circular rotation: wrap offset back to start when exceeding total
  v_adjusted_offset := p_offset % v_total_posts;

  -- Return posts with smart rotation
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.media_url,
    p.media_type,
    p.caption,
    p.created_at,
    p.likes_count,
    p.comments_count,
    p.shares_count,
    p.saves_count,
    p.views_count,
    EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = p_user_id) as is_liked,
    EXISTS(SELECT 1 FROM saved_posts sp WHERE sp.post_id = p.id AND sp.user_id = p_user_id) as is_saved,
    prof.username,
    prof.display_name,
    prof.avatar_url,
    prof.bio,
    prof.followers_count,
    prof.following_count
  FROM posts p
  INNER JOIN profiles prof ON prof.id = p.user_id
  WHERE 
    CASE 
      WHEN p_feed_type = 'following' THEN
        p.user_id IN (SELECT followed_id FROM follows WHERE follower_id = p_user_id)
      ELSE 
        TRUE
    END
  ORDER BY 
    -- Prioritize unseen posts first
    CASE WHEN NOT EXISTS(
      SELECT 1 FROM user_seen_posts usp 
      WHERE usp.post_id = p.id AND usp.user_id = p_user_id
    ) THEN 0 ELSE 1 END,
    -- Then by recency within seen/unseen groups
    p.created_at DESC
  LIMIT p_limit
  OFFSET v_adjusted_offset;
END;
$$;