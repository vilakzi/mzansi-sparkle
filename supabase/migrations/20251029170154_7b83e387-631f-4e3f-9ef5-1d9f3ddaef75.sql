-- Create hashtags table
CREATE TABLE public.hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  posts_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

-- Create post_hashtags junction table
CREATE TABLE public.post_hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  hashtag_id uuid REFERENCES public.hashtags(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(post_id, hashtag_id)
);

-- Enable RLS
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Hashtags are viewable by everyone"
  ON public.hashtags FOR SELECT
  USING (true);

CREATE POLICY "Post hashtags are viewable by everyone"
  ON public.post_hashtags FOR SELECT
  USING (true);

-- Create indexes
CREATE INDEX idx_hashtags_name ON public.hashtags(name);
CREATE INDEX idx_hashtags_posts_count ON public.hashtags(posts_count DESC);
CREATE INDEX idx_post_hashtags_post_id ON public.post_hashtags(post_id);
CREATE INDEX idx_post_hashtags_hashtag_id ON public.post_hashtags(hashtag_id);

-- Function to extract and create hashtags from post caption
CREATE OR REPLACE FUNCTION public.extract_hashtags(p_post_id uuid, p_caption text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hashtag text;
  v_hashtag_id uuid;
  v_hashtag_array text[];
BEGIN
  -- Extract hashtags using regex (matches #word)
  v_hashtag_array := regexp_matches(p_caption, '#([a-zA-Z0-9_]+)', 'g');
  
  -- Process each hashtag
  FOREACH v_hashtag IN ARRAY v_hashtag_array
  LOOP
    -- Convert to lowercase
    v_hashtag := lower(v_hashtag);
    
    -- Insert or get existing hashtag
    INSERT INTO hashtags (name, posts_count)
    VALUES (v_hashtag, 1)
    ON CONFLICT (name) 
    DO UPDATE SET posts_count = hashtags.posts_count + 1
    RETURNING id INTO v_hashtag_id;
    
    -- Link hashtag to post
    INSERT INTO post_hashtags (post_id, hashtag_id)
    VALUES (p_post_id, v_hashtag_id)
    ON CONFLICT (post_id, hashtag_id) DO NOTHING;
  END LOOP;
END;
$$;

-- Trigger to extract hashtags when post is created/updated
CREATE OR REPLACE FUNCTION public.process_post_hashtags()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.caption IS NOT NULL THEN
    -- Delete old hashtag associations if updating
    IF TG_OP = 'UPDATE' THEN
      DELETE FROM post_hashtags WHERE post_id = NEW.id;
    END IF;
    
    -- Extract and create new hashtags
    PERFORM extract_hashtags(NEW.id, NEW.caption);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER process_post_hashtags_trigger
  AFTER INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.process_post_hashtags();

-- Function to decrement hashtag count when post is deleted
CREATE OR REPLACE FUNCTION public.decrement_hashtag_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE hashtags
  SET posts_count = GREATEST(posts_count - 1, 0)
  WHERE id = OLD.hashtag_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER decrement_hashtag_count_trigger
  AFTER DELETE ON public.post_hashtags
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_hashtag_count();

-- Create post_views table for tracking engagement
CREATE TABLE public.post_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone DEFAULT now(),
  watch_duration integer DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can create their own views"
  ON public.post_views FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_post_views_post_id ON public.post_views(post_id);
CREATE INDEX idx_post_views_user_id ON public.post_views(user_id);
CREATE INDEX idx_post_views_viewed_at ON public.post_views(viewed_at DESC);

-- Function to update view count
CREATE OR REPLACE FUNCTION public.increment_view_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts 
  SET views_count = views_count + 1
  WHERE id = NEW.post_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER increment_post_view_count
  AFTER INSERT ON public.post_views
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_view_count();

-- Create trending posts view (posts from last 7 days ranked by engagement)
CREATE OR REPLACE VIEW public.trending_posts AS
SELECT 
  p.*,
  (p.likes_count * 3 + p.comments_count * 2 + p.views_count) as engagement_score
FROM posts p
WHERE p.created_at > NOW() - INTERVAL '7 days'
ORDER BY engagement_score DESC;

-- Process existing posts to extract hashtags
DO $$
DECLARE
  post_record RECORD;
BEGIN
  FOR post_record IN SELECT id, caption FROM posts WHERE caption IS NOT NULL
  LOOP
    PERFORM extract_hashtags(post_record.id, post_record.caption);
  END LOOP;
END $$;