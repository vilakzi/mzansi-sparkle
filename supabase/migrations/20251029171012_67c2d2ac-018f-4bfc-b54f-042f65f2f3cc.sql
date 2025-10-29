-- Update post_views table to track better metrics
ALTER TABLE public.post_views 
  ADD COLUMN completion_rate numeric DEFAULT 0,
  ADD COLUMN session_id text;

-- Create index for better performance
CREATE INDEX idx_post_views_session ON public.post_views(session_id);

-- Create saved posts table
CREATE TABLE public.saved_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, post_id)
);

-- Enable RLS
ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own saved posts"
  ON public.saved_posts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save posts"
  ON public.saved_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave posts"
  ON public.saved_posts FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_saved_posts_user_id ON public.saved_posts(user_id);
CREATE INDEX idx_saved_posts_post_id ON public.saved_posts(post_id);

-- Create shares table
CREATE TABLE public.post_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  share_type text NOT NULL, -- 'copy_link', 'external_platform', 'internal'
  platform text, -- 'twitter', 'whatsapp', 'facebook', etc.
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.post_shares ENABLE ROW LEVEL SECURITY;

-- RLS Policy - anyone can share
CREATE POLICY "Anyone can create shares"
  ON public.post_shares FOR INSERT
  WITH CHECK (true);

-- Create index
CREATE INDEX idx_post_shares_post_id ON public.post_shares(post_id);
CREATE INDEX idx_post_shares_user_id ON public.post_shares(user_id);

-- Add shares_count to posts
ALTER TABLE public.posts ADD COLUMN shares_count integer DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN saves_count integer DEFAULT 0;

-- Function to increment share count
CREATE OR REPLACE FUNCTION public.increment_share_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts 
  SET shares_count = shares_count + 1
  WHERE id = NEW.post_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER increment_post_share_count
  AFTER INSERT ON public.post_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_share_count();

-- Function to update saves count
CREATE OR REPLACE FUNCTION public.update_saves_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET saves_count = saves_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET saves_count = GREATEST(saves_count - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_post_saves_count
  AFTER INSERT OR DELETE ON public.saved_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_saves_count();

-- Create enhanced engagement score view
CREATE OR REPLACE VIEW public.enhanced_engagement_posts AS
SELECT 
  p.*,
  COALESCE(AVG(pv.completion_rate), 0) as avg_completion_rate,
  COALESCE(AVG(pv.watch_duration), 0) as avg_watch_duration,
  (
    p.likes_count * 3 + 
    p.comments_count * 2 + 
    p.shares_count * 4 +
    p.saves_count * 5 +
    (p.views_count * COALESCE(AVG(pv.completion_rate), 0))
  ) as enhanced_engagement_score
FROM posts p
LEFT JOIN post_views pv ON p.id = pv.post_id
WHERE p.created_at > NOW() - INTERVAL '7 days'
GROUP BY p.id
ORDER BY enhanced_engagement_score DESC;