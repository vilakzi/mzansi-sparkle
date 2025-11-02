-- Create function to fetch initial feed data in a single query
CREATE OR REPLACE FUNCTION public.get_initial_feed_data(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'profile', (
      SELECT row_to_json(p) 
      FROM profiles p 
      WHERE p.id = p_user_id
    ),
    'posts', (
      SELECT COALESCE(json_agg(post_data), '[]'::json)
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
          EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = p_user_id) as is_liked,
          EXISTS(SELECT 1 FROM saved_posts WHERE post_id = p.id AND user_id = p_user_id) as is_saved,
          (
            SELECT row_to_json(prof)
            FROM profiles prof
            WHERE prof.id = p.user_id
          ) as profile
        FROM posts p
        WHERE can_view_post(p_user_id, p.user_id)
        ORDER BY p.created_at DESC
        LIMIT 15
      ) post_data
    )
  ) INTO result;
  
  RETURN result;
END;
$function$;