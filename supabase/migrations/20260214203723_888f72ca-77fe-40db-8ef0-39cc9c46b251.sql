
-- Track views on job posts
CREATE TABLE public.job_post_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id UUID NOT NULL REFERENCES public.job_posts(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (job_post_id, viewer_id)
);

ALTER TABLE public.job_post_views ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert a view (once per user per job)
CREATE POLICY "Users can insert own views"
  ON public.job_post_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = viewer_id);

-- Recruiters can see views on their own posts
CREATE POLICY "Recruiters can view their post views"
  ON public.job_post_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_posts
      WHERE job_posts.id = job_post_views.job_post_id
        AND job_posts.recruiter_id = auth.uid()
    )
    OR auth.uid() = viewer_id
  );

-- Applications to recruiter-posted jobs
CREATE TABLE public.job_post_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_post_id UUID NOT NULL REFERENCES public.job_posts(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'applied',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (job_post_id, applicant_id)
);

ALTER TABLE public.job_post_applications ENABLE ROW LEVEL SECURITY;

-- Applicants can insert their own applications
CREATE POLICY "Users can apply to jobs"
  ON public.job_post_applications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = applicant_id);

-- Applicants can view their own applications
CREATE POLICY "Users can view own applications"
  ON public.job_post_applications FOR SELECT
  TO authenticated
  USING (auth.uid() = applicant_id);

-- Recruiters can view applications on their posts
CREATE POLICY "Recruiters can view applications on their posts"
  ON public.job_post_applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_posts
      WHERE job_posts.id = job_post_applications.job_post_id
        AND job_posts.recruiter_id = auth.uid()
    )
  );

-- Recruiters can update application status on their posts
CREATE POLICY "Recruiters can update application status"
  ON public.job_post_applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_posts
      WHERE job_posts.id = job_post_applications.job_post_id
        AND job_posts.recruiter_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_job_post_applications_updated_at
  BEFORE UPDATE ON public.job_post_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
