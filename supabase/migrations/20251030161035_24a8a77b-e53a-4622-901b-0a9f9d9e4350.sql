-- Fix get_trending_posts function to have search_path set
CREATE OR REPLACE FUNCTION public.get_trending_posts(limit_count integer DEFAULT 20)
RETURNS TABLE(id uuid, media_url text, media_type text, caption text, user_id uuid, likes_count integer, comments_count integer, views_count integer, created_at timestamp with time zone, engagement_score bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.media_url,
    p.media_type,
    p.caption,
    p.user_id,
    p.likes_count,
    p.comments_count,
    p.views_count,
    p.created_at,
    (p.likes_count * 3 + p.comments_count * 2 + p.views_count)::bigint as engagement_score
  FROM public.posts p
  WHERE p.created_at > NOW() - INTERVAL '7 days'
  ORDER BY engagement_score DESC
  LIMIT limit_count;
$$;