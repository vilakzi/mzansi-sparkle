-- Make posts-media bucket public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'posts-media';

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Public media is viewable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own media" ON storage.objects;

-- Allow anyone to view media in posts-media bucket
CREATE POLICY "Public media is viewable by everyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'posts-media');

-- Allow authenticated users to upload their own media
CREATE POLICY "Users can upload their own media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'posts-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own media
CREATE POLICY "Users can delete their own media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'posts-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);