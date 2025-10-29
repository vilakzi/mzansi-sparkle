-- Create profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  username text UNIQUE NOT NULL,
  avatar_url text,
  bio text,
  followers_count integer DEFAULT 0,
  following_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create profiles for existing users from posts
INSERT INTO public.profiles (id, display_name, username)
SELECT DISTINCT 
  p.user_id,
  COALESCE(u.email, 'User'),
  COALESCE(SPLIT_PART(u.email, '@', 1), 'user') || '_' || SUBSTRING(p.user_id::text, 1, 8)
FROM public.posts p
JOIN auth.users u ON p.user_id = u.id
ON CONFLICT (id) DO NOTHING;

-- Create follows table
CREATE TABLE public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  following_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK (follower_id != following_id)
);

-- Enable RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for follows
CREATE POLICY "Follows are viewable by everyone"
  ON public.follows FOR SELECT
  USING (true);

CREATE POLICY "Users can follow others"
  ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON public.follows FOR DELETE
  USING (auth.uid() = follower_id);

-- Create indexes
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_follows_follower ON public.follows(follower_id);
CREATE INDEX idx_follows_following ON public.follows(following_id);

-- Function to update profile updated_at
CREATE OR REPLACE FUNCTION public.update_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for profile updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profile_updated_at();

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, username, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1) || '_' || SUBSTRING(NEW.id::text, 1, 8)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to toggle follow
CREATE OR REPLACE FUNCTION public.toggle_follow(p_following_id uuid)
RETURNS TABLE(is_following boolean, new_follower_count integer, new_following_count integer) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_follower_id uuid;
  v_is_following boolean;
  v_follower_count integer;
  v_following_count integer;
BEGIN
  v_follower_id := auth.uid();
  
  IF v_follower_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF v_follower_id = p_following_id THEN
    RAISE EXCEPTION 'Cannot follow yourself';
  END IF;
  
  -- Check if already following
  SELECT EXISTS(
    SELECT 1 FROM follows 
    WHERE follower_id = v_follower_id AND following_id = p_following_id
  ) INTO v_is_following;
  
  IF v_is_following THEN
    -- Unfollow
    DELETE FROM follows 
    WHERE follower_id = v_follower_id AND following_id = p_following_id;
    
    -- Update counts
    UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0)
    WHERE id = p_following_id;
    
    UPDATE profiles SET following_count = GREATEST(following_count - 1, 0)
    WHERE id = v_follower_id;
    
    v_is_following := false;
  ELSE
    -- Follow
    INSERT INTO follows(follower_id, following_id)
    VALUES(v_follower_id, p_following_id);
    
    -- Update counts
    UPDATE profiles SET followers_count = followers_count + 1
    WHERE id = p_following_id;
    
    UPDATE profiles SET following_count = following_count + 1
    WHERE id = v_follower_id;
    
    v_is_following := true;
  END IF;
  
  -- Get updated counts
  SELECT followers_count INTO v_follower_count
  FROM profiles WHERE id = p_following_id;
  
  SELECT following_count INTO v_following_count
  FROM profiles WHERE id = v_follower_id;
  
  RETURN QUERY SELECT v_is_following, v_follower_count, v_following_count;
END;
$$;

-- Now add the foreign key constraint
ALTER TABLE public.posts DROP CONSTRAINT IF EXISTS posts_user_id_fkey;
ALTER TABLE public.posts ADD CONSTRAINT posts_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;