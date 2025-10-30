-- Drop the enhanced_engagement_posts view and replace with a function
-- This addresses the security definer view warning
DROP VIEW IF EXISTS public.enhanced_engagement_posts;

-- Create a function instead of a view for better security control
CREATE OR REPLACE FUNCTION public.get_enhanced_engagement_posts()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  media_url text,
  media_type text,
  caption text,
  likes_count integer,
  views_count integer,
  created_at timestamp with time zone,
  comments_count integer,
  shares_count integer,
  saves_count integer,
  avg_completion_rate numeric,
  avg_watch_duration numeric,
  enhanced_engagement_score numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.user_id,
    p.media_url,
    p.media_type,
    p.caption,
    p.likes_count,
    p.views_count,
    p.created_at,
    p.comments_count,
    p.shares_count,
    p.saves_count,
    COALESCE(AVG(pv.completion_rate), 0::numeric) AS avg_completion_rate,
    COALESCE(AVG(pv.watch_duration), 0::numeric) AS avg_watch_duration,
    (p.likes_count * 3 + p.comments_count * 2 + p.shares_count * 4 + p.saves_count * 5)::numeric + 
    p.views_count::numeric * COALESCE(AVG(pv.completion_rate), 0::numeric) AS enhanced_engagement_score
  FROM public.posts p
  LEFT JOIN public.post_views pv ON p.id = pv.post_id
  WHERE p.created_at > (NOW() - INTERVAL '7 days')
  GROUP BY p.id
  ORDER BY enhanced_engagement_score DESC;
$$;