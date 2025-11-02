-- Create user_interests table to track user preferences
CREATE TABLE IF NOT EXISTS public.user_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hashtag_id UUID NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  interest_score NUMERIC DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, hashtag_id)
);

-- Enable RLS
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_interests
CREATE POLICY "Users can view their own interests"
ON public.user_interests FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own interests"
ON public.user_interests FOR ALL
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_interests_user_id ON public.user_interests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interests_hashtag_id ON public.user_interests(hashtag_id);

-- Create post_categories table for broader categorization
CREATE TABLE IF NOT EXISTS public.post_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  posts_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.post_categories ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view categories
CREATE POLICY "Categories are viewable by everyone"
ON public.post_categories FOR SELECT
USING (true);

-- Create post_category_mappings table
CREATE TABLE IF NOT EXISTS public.post_category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.post_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(post_id, category_id)
);

-- Enable RLS
ALTER TABLE public.post_category_mappings ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view category mappings
CREATE POLICY "Category mappings are viewable by everyone"
ON public.post_category_mappings FOR SELECT
USING (true);

-- Insert default categories
INSERT INTO public.post_categories (name, display_name, description, icon) VALUES
  ('entertainment', 'Entertainment', 'Fun and entertaining content', '🎬'),
  ('education', 'Education', 'Educational and informative content', '📚'),
  ('sports', 'Sports', 'Sports and fitness content', '⚽'),
  ('music', 'Music', 'Music and audio content', '🎵'),
  ('food', 'Food', 'Food and cooking content', '🍔'),
  ('travel', 'Travel', 'Travel and adventure content', '✈️'),
  ('fashion', 'Fashion', 'Fashion and style content', '👗'),
  ('technology', 'Technology', 'Tech and innovation content', '💻'),
  ('art', 'Art', 'Art and creative content', '🎨'),
  ('lifestyle', 'Lifestyle', 'Lifestyle and daily life content', '🌟')
ON CONFLICT (name) DO NOTHING;

-- Function to get personalized feed with recommendation scoring
CREATE OR REPLACE FUNCTION public.get_personalized_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  media_url TEXT,
  media_type TEXT,
  caption TEXT,
  likes_count INTEGER,
  comments_count INTEGER,
  views_count INTEGER,
  shares_count INTEGER,
  saves_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE,
  recommendation_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
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
      
      -- View quality score (completion rate matters)
      COALESCE(
        (SELECT AVG(pv.completion_rate) * p.views_count * 2 
         FROM post_views pv 
         WHERE pv.post_id = p.id), 
        0
      ) +
      
      -- Recency boost (newer posts get higher scores)
      GREATEST(0, 100 - EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600)::NUMERIC +
      
      -- Interest match score (based on user's interests in hashtags)
      COALESCE(
        (SELECT SUM(ui.interest_score * 20)
         FROM user_interests ui
         JOIN post_hashtags ph ON ph.hashtag_id = ui.hashtag_id
         WHERE ui.user_id = p_user_id AND ph.post_id = p.id),
        0
      ) +
      
      -- Following boost (if user follows the post creator)
      CASE WHEN EXISTS(
        SELECT 1 FROM follows f 
        WHERE f.follower_id = p_user_id AND f.following_id = p.user_id
      ) THEN 50 ELSE 0 END
      
    ) AS recommendation_score
  FROM posts p
  WHERE 
    -- Exclude user's own posts from recommendations
    p.user_id != p_user_id
    -- Respect privacy settings and blocking
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
    -- Only show recent content (last 30 days)
    AND p.created_at > NOW() - INTERVAL '30 days'
  ORDER BY recommendation_score DESC, p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to get following feed
CREATE OR REPLACE FUNCTION public.get_following_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  media_url TEXT,
  media_type TEXT,
  caption TEXT,
  likes_count INTEGER,
  comments_count INTEGER,
  views_count INTEGER,
  shares_count INTEGER,
  saves_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
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
    p.created_at
  FROM posts p
  WHERE 
    -- Only posts from users the current user follows
    EXISTS(
      SELECT 1 FROM follows f 
      WHERE f.follower_id = p_user_id AND f.following_id = p.user_id
    )
    AND NOT is_blocked(p_user_id, p.user_id)
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to update user interests based on interactions
CREATE OR REPLACE FUNCTION public.update_user_interests_from_interaction(
  p_user_id UUID,
  p_post_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Increment interest score for hashtags in the post
  INSERT INTO user_interests (user_id, hashtag_id, interest_score)
  SELECT p_user_id, ph.hashtag_id, 1.0
  FROM post_hashtags ph
  WHERE ph.post_id = p_post_id
  ON CONFLICT (user_id, hashtag_id) 
  DO UPDATE SET 
    interest_score = user_interests.interest_score + 0.5,
    updated_at = now();
END;
$$;