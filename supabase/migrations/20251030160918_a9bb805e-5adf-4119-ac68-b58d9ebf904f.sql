-- Create avatars storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);

-- Storage RLS Policies for avatars bucket
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Avatars are viewable by authenticated users"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Add username change tracking column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_updated_at TIMESTAMP WITH TIME ZONE;

-- Function to check username availability
CREATE OR REPLACE FUNCTION check_username_available(new_username TEXT, user_id UUID)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE username = new_username 
    AND id != user_id
  );
END;
$$;

-- Function to delete post with media cleanup
CREATE OR REPLACE FUNCTION delete_post_with_media(p_post_id UUID)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_media_url TEXT;
  v_user_id UUID;
BEGIN
  -- Verify the user owns this post
  SELECT user_id, media_url INTO v_user_id, v_media_url
  FROM posts 
  WHERE id = p_post_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Post not found';
  END IF;
  
  IF v_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to delete this post';
  END IF;
  
  -- Delete the post (cascades to related tables via foreign keys)
  DELETE FROM posts WHERE id = p_post_id;
  
  -- Note: Storage file deletion must be handled client-side
  -- as we cannot directly access storage API from SQL functions
END;
$$;