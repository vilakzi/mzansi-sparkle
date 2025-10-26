-- Create post_likes junction table to track which users liked which posts
CREATE TABLE IF NOT EXISTS public.post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Enable RLS on post_likes
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all likes
CREATE POLICY "Anyone can view post likes"
ON public.post_likes
FOR SELECT
USING (true);

-- Policy: Users can only insert their own likes
CREATE POLICY "Users can insert their own likes"
ON public.post_likes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only delete their own likes
CREATE POLICY "Users can delete their own likes"
ON public.post_likes
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON public.post_likes(user_id);

-- Create database function to toggle likes atomically (prevents race conditions)
CREATE OR REPLACE FUNCTION public.toggle_post_like(p_post_id UUID)
RETURNS TABLE(liked BOOLEAN, new_count INTEGER) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_liked BOOLEAN;
  v_count INTEGER;
BEGIN
  -- Get the current user
  v_user_id := auth.uid();
  
  -- Check if user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Check if user already liked this post
  SELECT EXISTS(
    SELECT 1 FROM post_likes 
    WHERE post_id = p_post_id AND user_id = v_user_id
  ) INTO v_liked;
  
  IF v_liked THEN
    -- Unlike: remove the like
    DELETE FROM post_likes 
    WHERE post_id = p_post_id AND user_id = v_user_id;
    
    -- Decrement the counter
    UPDATE posts 
    SET likes_count = GREATEST(likes_count - 1, 0)
    WHERE id = p_post_id;
    
    v_liked := FALSE;
  ELSE
    -- Like: add the like
    INSERT INTO post_likes(post_id, user_id) 
    VALUES(p_post_id, v_user_id);
    
    -- Increment the counter
    UPDATE posts 
    SET likes_count = likes_count + 1
    WHERE id = p_post_id;
    
    v_liked := TRUE;
  END IF;
  
  -- Get the new count
  SELECT likes_count INTO v_count
  FROM posts
  WHERE id = p_post_id;
  
  RETURN QUERY SELECT v_liked, v_count;
END;
$$;