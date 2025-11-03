import { supabase } from "@/integrations/supabase/client";
import { isPersonalizedFeedEnabled } from "@/lib/featureFlags";

/**
 * Fetch feed for a user.
 * - Default behavior: call get_simple_feed (fast)
 * - If NEXT_PUBLIC_PERSONALIZED_FEED=true, call get_personalized_feed (legacy behavior)
 *
 * This function normalizes DB field names to the client-side shape expected by UI components.
 */
export async function fetchFeed({
  userId,
  feedType = "for-you", // or 'following'
  limit = 20,
  offset = 0,
}: {
  userId: string;
  feedType?: "for-you" | "following";
  limit?: number;
  offset?: number;
}) {
  const personalized = isPersonalizedFeedEnabled();

  if (!personalized) {
    console.info("[feed] Running in SIMPLE feed mode (get_simple_feed)");
  } else {
    console.warn("[feed] Running in PERSONALIZED feed mode (get_personalized_feed). This may be slower.");
  }

  try {
    if (!personalized) {
      // Use simple feed RPC (fast)
      const { data, error } = await supabase.rpc("get_simple_feed", {
        p_user_id: userId,
        p_feed_type: feedType,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;

      // normalize returned rows -> client shape
      // get_simple_feed may return an array of rows (table) or json with posts, handle both
      const rows = Array.isArray(data) ? data : (data?.posts ?? []);
      const normalized = (rows || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        media_url: r.media_url,
        media_type: r.media_type,
        caption: r.caption,
        likes_count: r.likes_count,
        comments_count: r.comments_count,
        views_count: r.views_count,
        shares_count: r.shares_count,
        saves_count: r.saves_count,
        created_at: r.created_at,
        username: r.username ?? r.display_name,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
        bio: r.bio,
        followers_count: r.followers_count,
        following_count: r.following_count,
        is_liked: Boolean(r.is_liked),
        is_saved: Boolean(r.is_saved),
      }));

      return { rows: normalized };
    } else {
      // Use personalized feed RPC (existing behavior)
      const { data, error } = await supabase.rpc("get_personalized_feed", {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;

      const normalized = (data || []).map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        media_url: r.media_url,
        media_type: r.media_type,
        caption: r.caption,
        likes_count: r.likes_count,
        comments_count: r.comments_count,
        views_count: r.views_count,
        shares_count: r.shares_count,
        saves_count: r.saves_count,
        created_at: r.created_at,
        recommendation_score: r.recommendation_score,
      }));

      return { rows: normalized };
    }
  } catch (err) {
    console.error("[feed] Error fetching feed:", err);
    throw err;
  }
}

export default fetchFeed;