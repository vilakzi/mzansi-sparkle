-- Fix security warning: Move pg_trgm extension to extensions schema instead of public

-- First drop existing indexes that use the extension
DROP INDEX IF EXISTS public.idx_profiles_username_trgm;
DROP INDEX IF EXISTS public.idx_profiles_display_name_trgm;

-- Drop extension from public schema
DROP EXTENSION IF EXISTS pg_trgm;

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Recreate extension in extensions schema
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- Recreate the trigram indexes with proper schema reference
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm ON public.profiles USING gin(username extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm ON public.profiles USING gin(display_name extensions.gin_trgm_ops);