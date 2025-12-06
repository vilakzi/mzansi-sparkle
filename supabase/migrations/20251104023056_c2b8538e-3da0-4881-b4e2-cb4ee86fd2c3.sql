-- Simplify storage RLS policies for posts-media bucket
-- Remove the overly complex privacy policy that's causing authentication issues
DROP POLICY IF EXISTS "Media access respects privacy settings" ON storage.objects;

-- Remove the duplicate public access policy
DROP POLICY IF EXISTS "Public media is viewable by everyone" ON storage.objects;

-- Keep only the simple "Media is publicly accessible" policy
-- This policy already exists and will handle all public access to the posts-media bucket