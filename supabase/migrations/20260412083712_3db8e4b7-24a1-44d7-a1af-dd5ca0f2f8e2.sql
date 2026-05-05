
-- 1. Add UNIQUE constraint on user_roles(user_id) to prevent multiple role rows
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_unique UNIQUE (user_id);

-- 2. Fix scheduled_interviews policies: change from public to authenticated role
DROP POLICY IF EXISTS "Applicants can view own interviews" ON public.scheduled_interviews;
DROP POLICY IF EXISTS "Recruiters can delete own interviews" ON public.scheduled_interviews;
DROP POLICY IF EXISTS "Recruiters can insert own interviews" ON public.scheduled_interviews;
DROP POLICY IF EXISTS "Recruiters can update own interviews" ON public.scheduled_interviews;
DROP POLICY IF EXISTS "Recruiters can view own interviews" ON public.scheduled_interviews;

CREATE POLICY "Applicants can view own interviews"
ON public.scheduled_interviews FOR SELECT TO authenticated
USING (auth.uid() = applicant_id);

CREATE POLICY "Recruiters can view own interviews"
ON public.scheduled_interviews FOR SELECT TO authenticated
USING (auth.uid() = recruiter_id);

CREATE POLICY "Recruiters can insert own interviews"
ON public.scheduled_interviews FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = recruiter_id) AND has_role(auth.uid(), 'recruiter'::app_role));

CREATE POLICY "Recruiters can update own interviews"
ON public.scheduled_interviews FOR UPDATE TO authenticated
USING ((auth.uid() = recruiter_id) AND has_role(auth.uid(), 'recruiter'::app_role));

CREATE POLICY "Recruiters can delete own interviews"
ON public.scheduled_interviews FOR DELETE TO authenticated
USING ((auth.uid() = recruiter_id) AND has_role(auth.uid(), 'recruiter'::app_role));
