
-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('job_seeker', 'recruiter');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create job_posts table
CREATE TABLE public.job_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  location TEXT,
  job_type TEXT NOT NULL DEFAULT 'full-time',
  description TEXT,
  requirements TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_posts ENABLE ROW LEVEL SECURITY;

-- Recruiters can manage their own posts
CREATE POLICY "Recruiters can insert own posts"
  ON public.job_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = recruiter_id AND public.has_role(auth.uid(), 'recruiter'));

CREATE POLICY "Recruiters can update own posts"
  ON public.job_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = recruiter_id AND public.has_role(auth.uid(), 'recruiter'));

CREATE POLICY "Recruiters can delete own posts"
  ON public.job_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = recruiter_id AND public.has_role(auth.uid(), 'recruiter'));

-- All authenticated users can view active posts
CREATE POLICY "Anyone can view active posts"
  ON public.job_posts FOR SELECT
  TO authenticated
  USING (status = 'active' OR auth.uid() = recruiter_id);

-- Trigger for updated_at
CREATE TRIGGER update_job_posts_updated_at
  BEFORE UPDATE ON public.job_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
