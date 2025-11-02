-- Phase 4: Add comprehensive indexes for optimal query performance

-- Enable pg_trgm extension for fuzzy search FIRST
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Comments table indexes (for post detail pages and comment threads)
CREATE INDEX IF NOT EXISTS idx_comments_post_id_created_at ON public.comments(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- Post likes indexes (for checking if user liked a post)
CREATE INDEX IF NOT EXISTS idx_post_likes_user_post ON public.post_likes(user_id, post_id);

-- Saved posts indexes
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_created ON public.saved_posts(user_id, created_at DESC);

-- Follows indexes (already added in Phase 1, ensuring they exist)
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON public.follows(following_id);

-- Messages indexes (for conversation views)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);

-- Conversation participants indexes
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON public.conversation_participants(conversation_id);

-- Conversations index
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read, created_at DESC);

-- Post hashtags indexes
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag_id ON public.post_hashtags(hashtag_id);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_post_id ON public.post_hashtags(post_id);

-- Hashtags index
CREATE INDEX IF NOT EXISTS idx_hashtags_name ON public.hashtags(name);
CREATE INDEX IF NOT EXISTS idx_hashtags_posts_count ON public.hashtags(posts_count DESC);

-- Post views indexes (for analytics)
CREATE INDEX IF NOT EXISTS idx_post_views_post_id ON public.post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_post_views_user_id ON public.post_views(user_id) WHERE user_id IS NOT NULL;

-- Post shares indexes
CREATE INDEX IF NOT EXISTS idx_post_shares_post_id ON public.post_shares(post_id);
CREATE INDEX IF NOT EXISTS idx_post_shares_user_id ON public.post_shares(user_id) WHERE user_id IS NOT NULL;

-- Profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm ON public.profiles USING gin(username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm ON public.profiles USING gin(display_name gin_trgm_ops);

-- Blocked users indexes
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON public.blocked_users(blocked_id);

-- Privacy settings index
CREATE INDEX IF NOT EXISTS idx_privacy_settings_user_private ON public.privacy_settings(user_id, is_private);

-- Reports indexes (for admin dashboard)
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON public.reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);

-- Analyze tables to update statistics for query planner
ANALYZE public.posts;
ANALYZE public.comments;
ANALYZE public.follows;
ANALYZE public.post_likes;
ANALYZE public.profiles;
ANALYZE public.messages;
ANALYZE public.conversations;