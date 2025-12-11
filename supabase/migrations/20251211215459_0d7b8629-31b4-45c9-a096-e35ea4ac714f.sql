-- Drop the security definer view and use a different approach
-- Instead of a view, we'll update the application to use the is_following function
DROP VIEW IF EXISTS public.profiles_safe;