-- Create smart shuffle feed function that buckets posts by age and randomizes within buckets
CREATE OR REPLACE FUNCTION public.get_shuffled_feed(
  p_user_id uuid,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
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
  bucket_order integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH bucketed_posts AS (
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
      CASE
        WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 1
        WHEN p.created_at > NOW() - INTERVAL '3 days' THEN 2
        WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 3
        ELSE 4
      END as bucket_order
    FROM posts p
    WHERE 
      p.user_id != p_user_id
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
    bp.id,
    bp.user_id,
    bp.media_url,
    bp.media_type,
    bp.caption,
    bp.likes_count,
    bp.comments_count,
    bp.views_count,
    bp.shares_count,
    bp.saves_count,
    bp.created_at,
    bp.bucket_order
  FROM bucketed_posts bp
  ORDER BY bp.bucket_order ASC, RANDOM()
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;