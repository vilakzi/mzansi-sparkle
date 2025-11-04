-- Create a new RPC function to fetch the user's feed with optimized performance.
-- This function consolidates multiple queries into one, reducing database round-trips.
-- It fetches posts and joins them with profiles, while also checking if the
-- current user has liked or saved each post.
--
-- Parameters:
--   - p_batch_size: The number of posts to fetch per page.
--   - p_page_num: The page number to retrieve, for pagination.
--
-- Returns:
--   A table of posts with extended information, including profile details and
--   user-specific flags for likes and saves.

create or replace function get_feed_posts(p_batch_size integer, p_page_num integer)
returns table (
    id uuid,
    media_url text,
    media_type text,
    caption text,
    likes_count bigint,
    comments_count bigint,
    shares_count bigint,
    saves_count bigint,
    views_count bigint,
    created_at timestamp with time zone,
    user_id uuid,
    user_liked boolean,
    user_saved boolean,
    profile json
) as $$
begin
    return query
    select
        p.id,
        p.media_url,
        p.media_type,
        p.caption,
        p.likes_count,
        p.comments_count,
        p.shares_count,
        p.saves_count,
        p.views_count,
        p.created_at,
        p.user_id,
        -- Check if the current user has liked the post
        exists(select 1 from post_likes pl where pl.post_id = p.id and pl.user_id = auth.uid()) as user_liked,
        -- Check if the current user has saved the post
        exists(select 1 from saved_posts sp where sp.post_id = p.id and sp.user_id = auth.uid()) as user_saved,
        -- Aggregate profile information into a JSON object
        json_build_object(
            'username', pr.username,
            'display_name', pr.display_name,
            'avatar_url', pr.avatar_url
        ) as profile
    from
        posts p
    join
        profiles pr on p.user_id = pr.id
    order by
        p.created_at desc
    limit
        p_batch_size
    offset
        (p_page_num - 1) * p_batch_size;
end;
$$ language plpgsql;
