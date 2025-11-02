-- Phase 1: Create upload_sessions table for resumable uploads
CREATE TABLE IF NOT EXISTS public.upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  file_type text NOT NULL,
  total_chunks integer NOT NULL,
  uploaded_chunks integer[] DEFAULT '{}',
  storage_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'uploaded', 'processing', 'complete', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own upload sessions"
ON public.upload_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own upload sessions"
ON public.upload_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own upload sessions"
ON public.upload_sessions FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_upload_session_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_upload_sessions_timestamp
BEFORE UPDATE ON public.upload_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_upload_session_timestamp();