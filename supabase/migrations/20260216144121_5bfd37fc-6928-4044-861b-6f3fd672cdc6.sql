-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can view company profiles" ON public.recruiter_companies;

-- Replace with a policy that only shows companies with active job posts (or own company)
CREATE POLICY "View companies with active jobs"
  ON public.recruiter_companies FOR SELECT
  USING (
    auth.uid() = recruiter_id OR
    EXISTS (
      SELECT 1 FROM public.job_posts
      WHERE job_posts.recruiter_id = recruiter_companies.recruiter_id
        AND job_posts.status = 'active'
    )
  );