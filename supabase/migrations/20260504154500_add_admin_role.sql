-- Add admin to app_role enum if it exists, otherwise recreate it
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('job_seeker', 'recruiter', 'admin');
  ELSE
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
  END IF;
END $$;

-- Ensure RLS policies allow admins to see everything
-- Resumes
CREATE POLICY "Admins can view all resumes" ON public.resumes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Job Posts
CREATE POLICY "Admins can manage all job posts" ON public.job_posts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
