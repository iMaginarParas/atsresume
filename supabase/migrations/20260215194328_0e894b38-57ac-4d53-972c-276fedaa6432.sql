
-- Create recruiter_companies table
CREATE TABLE public.recruiter_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id uuid NOT NULL,
  company_name text NOT NULL,
  logo_url text,
  website text,
  industry text,
  company_size text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recruiter_id)
);

ALTER TABLE public.recruiter_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiters can view own company"
  ON public.recruiter_companies FOR SELECT
  USING (auth.uid() = recruiter_id);

CREATE POLICY "Recruiters can insert own company"
  ON public.recruiter_companies FOR INSERT
  WITH CHECK (auth.uid() = recruiter_id AND public.has_role(auth.uid(), 'recruiter'));

CREATE POLICY "Recruiters can update own company"
  ON public.recruiter_companies FOR UPDATE
  USING (auth.uid() = recruiter_id AND public.has_role(auth.uid(), 'recruiter'));

CREATE POLICY "Recruiters can delete own company"
  ON public.recruiter_companies FOR DELETE
  USING (auth.uid() = recruiter_id AND public.has_role(auth.uid(), 'recruiter'));

-- Auto-update updated_at
CREATE TRIGGER update_recruiter_companies_updated_at
  BEFORE UPDATE ON public.recruiter_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add columns to job_post_applications
ALTER TABLE public.job_post_applications
  ADD COLUMN recruiter_notes text,
  ADD COLUMN is_shortlisted boolean NOT NULL DEFAULT false;

-- Add missing DELETE policy for job_post_applications
CREATE POLICY "Recruiters can delete applications on their posts"
  ON public.job_post_applications FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM job_posts
    WHERE job_posts.id = job_post_applications.job_post_id
      AND job_posts.recruiter_id = auth.uid()
  ));

-- Allow anyone to view company profiles (for job listings display)
CREATE POLICY "Anyone can view company profiles"
  ON public.recruiter_companies FOR SELECT
  USING (true);
