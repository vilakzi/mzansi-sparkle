-- Phase 2.1: Create optimized feed query that returns everything in one call
CREATE OR REPLACE FUNCTION public.get_complete_feed_data(
  p_user_id uuid,
  p_feed_type text DEFAULT 'for-you',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
) RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result json;
BEGIN
  IF p_feed_type = 'following' THEN
    -- Following feed: posts from followed users
    SELECT json_build_object(
      'posts', COALESCE(json_agg(
        json_build_object(
          'id', p.id,
          'user_id', p.user_id,
          'media_url', p.media_url,
          'media_type', p.media_type,
          'caption', p.caption,
          'likes_count', p.likes_count,
          'comments_count', p.comments_count,
          'views_count', p.views_count,
          'shares_count', p.shares_count,
          'saves_count', p.saves_count,
          'created_at', p.created_at,
          'is_liked', EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = p_user_id),
          'is_saved', EXISTS(SELECT 1 FROM saved_posts WHERE post_id = p.id AND user_id = p_user_id),
          'profile', json_build_object(
            'id', prof.id,
            'username', prof.username,
            'display_name', prof.display_name,
            'avatar_url', prof.avatar_url,
            'bio', prof.bio,
            'followers_count', prof.followers_count,
            'following_count', prof.following_count
          )
        ) ORDER BY p.created_at DESC
      ), '[]'::json)
    ) INTO result
    FROM posts p
    JOIN profiles prof ON prof.id = p.user_id
    WHERE EXISTS(
      SELECT 1 FROM follows f 
      WHERE f.follower_id = p_user_id AND f.following_id = p.user_id
    )
    AND NOT is_blocked(p_user_id, p.user_id)
    LIMIT p_limit
    OFFSET p_offset;
  ELSE
    -- For You feed: shuffled/personalized feed
    SELECT json_build_object(
      'posts', COALESCE(json_agg(
        json_build_object(
          'id', bp.id,
          'user_id', bp.user_id,
          'media_url', bp.media_url,
          'media_type', bp.media_type,
          'caption', bp.caption,
          'likes_count', bp.likes_count,
          'comments_count', bp.comments_count,
          'views_count', bp.views_count,
          'shares_count', bp.shares_count,
          'saves_count', bp.saves_count,
          'created_at', bp.created_at,
          'is_liked', EXISTS(SELECT 1 FROM post_likes WHERE post_id = bp.id AND user_id = p_user_id),
          'is_saved', EXISTS(SELECT 1 FROM saved_posts WHERE post_id = bp.id AND user_id = p_user_id),
          'profile', json_build_object(
            'id', prof.id,
            'username', prof.username,
            'display_name', prof.display_name,
            'avatar_url', prof.avatar_url,
            'bio', prof.bio,
            'followers_count', prof.followers_count,
            'following_count', prof.following_count
          )
        ) ORDER BY bp.bucket_order ASC, RANDOM()
      ), '[]'::json)
    ) INTO result
    FROM (
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
    ) bp
    JOIN profiles prof ON prof.id = bp.user_id
    LIMIT p_limit
    OFFSET p_offset;
  END IF;
  
  RETURN result;
END;
$$;