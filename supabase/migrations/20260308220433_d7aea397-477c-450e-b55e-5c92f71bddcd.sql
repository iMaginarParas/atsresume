
-- =============================================
-- Convert all RESTRICTIVE policies to PERMISSIVE
-- by dropping and recreating each one
-- =============================================

-- job_post_views
DROP POLICY IF EXISTS "Recruiters can view their post views" ON public.job_post_views;
CREATE POLICY "Recruiters can view their post views" ON public.job_post_views
  FOR SELECT TO authenticated
  USING ((EXISTS (SELECT 1 FROM job_posts WHERE job_posts.id = job_post_views.job_post_id AND job_posts.recruiter_id = auth.uid())) OR (auth.uid() = viewer_id));

DROP POLICY IF EXISTS "Users can insert own views" ON public.job_post_views;
CREATE POLICY "Users can insert own views" ON public.job_post_views
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = viewer_id);

-- job_posts
DROP POLICY IF EXISTS "Anyone can view active posts" ON public.job_posts;
CREATE POLICY "Anyone can view active posts" ON public.job_posts
  FOR SELECT TO authenticated
  USING (status = 'active' OR auth.uid() = recruiter_id);

DROP POLICY IF EXISTS "Recruiters can delete own posts" ON public.job_posts;
CREATE POLICY "Recruiters can delete own posts" ON public.job_posts
  FOR DELETE TO authenticated
  USING (auth.uid() = recruiter_id AND has_role(auth.uid(), 'recruiter'));

DROP POLICY IF EXISTS "Recruiters can insert own posts" ON public.job_posts;
CREATE POLICY "Recruiters can insert own posts" ON public.job_posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = recruiter_id AND has_role(auth.uid(), 'recruiter'));

DROP POLICY IF EXISTS "Recruiters can update own posts" ON public.job_posts;
CREATE POLICY "Recruiters can update own posts" ON public.job_posts
  FOR UPDATE TO authenticated
  USING (auth.uid() = recruiter_id AND has_role(auth.uid(), 'recruiter'));

-- resumes
DROP POLICY IF EXISTS "Users can delete own resumes" ON public.resumes;
CREATE POLICY "Users can delete own resumes" ON public.resumes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own resumes" ON public.resumes;
CREATE POLICY "Users can insert own resumes" ON public.resumes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own resumes" ON public.resumes;
CREATE POLICY "Users can update own resumes" ON public.resumes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own resumes" ON public.resumes;
CREATE POLICY "Users can view own resumes" ON public.resumes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ai_apply_campaigns
DROP POLICY IF EXISTS "Users can delete own campaigns" ON public.ai_apply_campaigns;
CREATE POLICY "Users can delete own campaigns" ON public.ai_apply_campaigns
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own campaigns" ON public.ai_apply_campaigns;
CREATE POLICY "Users can insert own campaigns" ON public.ai_apply_campaigns
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own campaigns" ON public.ai_apply_campaigns;
CREATE POLICY "Users can update own campaigns" ON public.ai_apply_campaigns
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own campaigns" ON public.ai_apply_campaigns;
CREATE POLICY "Users can view own campaigns" ON public.ai_apply_campaigns
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- user_subscriptions (SELECT only - INSERT/UPDATE removed for security)
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- saved_jobs
DROP POLICY IF EXISTS "Users can delete own saved jobs" ON public.saved_jobs;
CREATE POLICY "Users can delete own saved jobs" ON public.saved_jobs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own saved jobs" ON public.saved_jobs;
CREATE POLICY "Users can insert own saved jobs" ON public.saved_jobs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own saved jobs" ON public.saved_jobs;
CREATE POLICY "Users can update own saved jobs" ON public.saved_jobs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own saved jobs" ON public.saved_jobs;
CREATE POLICY "Users can view own saved jobs" ON public.saved_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- email_outreach_history
DROP POLICY IF EXISTS "Users can delete own email history" ON public.email_outreach_history;
CREATE POLICY "Users can delete own email history" ON public.email_outreach_history
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own email history" ON public.email_outreach_history;
CREATE POLICY "Users can insert own email history" ON public.email_outreach_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own email history" ON public.email_outreach_history;
CREATE POLICY "Users can view own email history" ON public.email_outreach_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- job_applications
DROP POLICY IF EXISTS "Users can delete own applications" ON public.job_applications;
CREATE POLICY "Users can delete own applications" ON public.job_applications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own applications" ON public.job_applications;
CREATE POLICY "Users can insert own applications" ON public.job_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own applications" ON public.job_applications;
CREATE POLICY "Users can update own applications" ON public.job_applications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own applications" ON public.job_applications;
CREATE POLICY "Users can view own applications" ON public.job_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- cover_letters
DROP POLICY IF EXISTS "Users can delete own cover letters" ON public.cover_letters;
CREATE POLICY "Users can delete own cover letters" ON public.cover_letters
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own cover letters" ON public.cover_letters;
CREATE POLICY "Users can insert own cover letters" ON public.cover_letters
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own cover letters" ON public.cover_letters;
CREATE POLICY "Users can update own cover letters" ON public.cover_letters
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own cover letters" ON public.cover_letters;
CREATE POLICY "Users can view own cover letters" ON public.cover_letters
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- pinned_companies
DROP POLICY IF EXISTS "Users can delete own pinned companies" ON public.pinned_companies;
CREATE POLICY "Users can delete own pinned companies" ON public.pinned_companies
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own pinned companies" ON public.pinned_companies;
CREATE POLICY "Users can insert own pinned companies" ON public.pinned_companies
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own pinned companies" ON public.pinned_companies;
CREATE POLICY "Users can view own pinned companies" ON public.pinned_companies
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- user_roles
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
CREATE POLICY "Users can insert own role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'job_seeker');

DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ai_apply_queue
DROP POLICY IF EXISTS "Users can delete own ai apply queue" ON public.ai_apply_queue;
CREATE POLICY "Users can delete own ai apply queue" ON public.ai_apply_queue
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ai apply queue" ON public.ai_apply_queue;
CREATE POLICY "Users can insert own ai apply queue" ON public.ai_apply_queue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ai apply queue" ON public.ai_apply_queue;
CREATE POLICY "Users can update own ai apply queue" ON public.ai_apply_queue
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own ai apply queue" ON public.ai_apply_queue;
CREATE POLICY "Users can view own ai apply queue" ON public.ai_apply_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- recruiter_companies
DROP POLICY IF EXISTS "Recruiters can delete own company" ON public.recruiter_companies;
CREATE POLICY "Recruiters can delete own company" ON public.recruiter_companies
  FOR DELETE TO authenticated
  USING (auth.uid() = recruiter_id AND has_role(auth.uid(), 'recruiter'));

DROP POLICY IF EXISTS "Recruiters can insert own company" ON public.recruiter_companies;
CREATE POLICY "Recruiters can insert own company" ON public.recruiter_companies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = recruiter_id AND has_role(auth.uid(), 'recruiter'));

DROP POLICY IF EXISTS "Recruiters can update own company" ON public.recruiter_companies;
CREATE POLICY "Recruiters can update own company" ON public.recruiter_companies
  FOR UPDATE TO authenticated
  USING (auth.uid() = recruiter_id AND has_role(auth.uid(), 'recruiter'));

DROP POLICY IF EXISTS "Recruiters can view own company" ON public.recruiter_companies;
CREATE POLICY "Recruiters can view own company" ON public.recruiter_companies
  FOR SELECT TO authenticated USING (auth.uid() = recruiter_id);

DROP POLICY IF EXISTS "View companies with active jobs" ON public.recruiter_companies;
CREATE POLICY "View companies with active jobs" ON public.recruiter_companies
  FOR SELECT TO authenticated
  USING (auth.uid() = recruiter_id OR EXISTS (SELECT 1 FROM job_posts WHERE job_posts.recruiter_id = recruiter_companies.recruiter_id AND job_posts.status = 'active'));

-- job_post_applications
DROP POLICY IF EXISTS "Recruiters can delete applications on their posts" ON public.job_post_applications;
CREATE POLICY "Recruiters can delete applications on their posts" ON public.job_post_applications
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM job_posts WHERE job_posts.id = job_post_applications.job_post_id AND job_posts.recruiter_id = auth.uid()));

DROP POLICY IF EXISTS "Recruiters can update application status" ON public.job_post_applications;
CREATE POLICY "Recruiters can update application status" ON public.job_post_applications
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM job_posts WHERE job_posts.id = job_post_applications.job_post_id AND job_posts.recruiter_id = auth.uid()));

DROP POLICY IF EXISTS "Recruiters can view applications on their posts" ON public.job_post_applications;
CREATE POLICY "Recruiters can view applications on their posts" ON public.job_post_applications
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM job_posts WHERE job_posts.id = job_post_applications.job_post_id AND job_posts.recruiter_id = auth.uid()));

DROP POLICY IF EXISTS "Users can apply to jobs" ON public.job_post_applications;
CREATE POLICY "Users can apply to jobs" ON public.job_post_applications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = applicant_id);

DROP POLICY IF EXISTS "Users can view own applications" ON public.job_post_applications;
CREATE POLICY "Users can view own applications" ON public.job_post_applications
  FOR SELECT TO authenticated USING (auth.uid() = applicant_id);
