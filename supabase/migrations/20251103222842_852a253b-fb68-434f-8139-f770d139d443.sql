-- Set aggressive cache headers for video content in posts-media bucket
-- This tells CDNs and browsers to cache videos for 1 year (immutable)

UPDATE storage.buckets
SET file_size_limit = 104857600, -- 100MB
    public = true,
    avif_autodetection = false,
    allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']
WHERE id = 'posts-media';

-- Note: Cache-Control headers are set at the CDN/edge level in Supabase
-- The CacheFirst strategy in vite.config.ts + 30-day maxAgeSeconds handles client-side caching
-- Supabase automatically serves storage files with appropriate cache headers when public = true