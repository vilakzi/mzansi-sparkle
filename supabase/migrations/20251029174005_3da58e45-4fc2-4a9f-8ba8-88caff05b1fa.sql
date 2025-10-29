-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT report_target_check CHECK (
    (reported_user_id IS NOT NULL) OR 
    (post_id IS NOT NULL) OR 
    (comment_id IS NOT NULL)
  )
);

-- Create blocked_users table
CREATE TABLE public.blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

-- Create privacy_settings table
CREATE TABLE public.privacy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_private BOOLEAN DEFAULT false,
  who_can_comment TEXT DEFAULT 'everyone' CHECK (who_can_comment IN ('everyone', 'followers', 'none')),
  show_followers BOOLEAN DEFAULT true,
  show_following BOOLEAN DEFAULT true,
  age_restricted_content BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for reports
CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Admins and moderators can view all reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'moderator')
  );

CREATE POLICY "Users can view their own reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

CREATE POLICY "Admins and moderators can update reports"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'moderator')
  );

-- RLS Policies for blocked_users
CREATE POLICY "Users can view their blocks"
  ON public.blocked_users FOR SELECT
  TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block others"
  ON public.blocked_users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can unblock others"
  ON public.blocked_users FOR DELETE
  TO authenticated
  USING (auth.uid() = blocker_id);

-- RLS Policies for privacy_settings
CREATE POLICY "Users can view their own privacy settings"
  ON public.privacy_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own privacy settings"
  ON public.privacy_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own privacy settings"
  ON public.privacy_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to create default privacy settings
CREATE OR REPLACE FUNCTION public.create_default_privacy_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.privacy_settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger to create privacy settings on user signup
CREATE TRIGGER on_user_created_privacy
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_privacy_settings();

-- Function to check if a user is blocked
CREATE OR REPLACE FUNCTION public.is_blocked(viewer_id UUID, target_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = target_id AND blocked_id = viewer_id)
       OR (blocker_id = viewer_id AND blocked_id = target_id)
  )
$$;

-- Function to update privacy settings timestamp
CREATE OR REPLACE FUNCTION public.update_privacy_settings_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_privacy_settings_updated_at
  BEFORE UPDATE ON public.privacy_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_privacy_settings_timestamp();