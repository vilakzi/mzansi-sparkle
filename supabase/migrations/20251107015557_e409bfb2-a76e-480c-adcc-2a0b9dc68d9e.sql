-- Drop the problematic hybrid feed function
DROP FUNCTION IF EXISTS public.get_hybrid_feed(uuid, integer, integer);

-- The VerticalFeed will use the direct posts query instead