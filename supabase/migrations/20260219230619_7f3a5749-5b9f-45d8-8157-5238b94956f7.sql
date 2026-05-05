
CREATE TABLE public.email_outreach_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  job_application_id UUID NULL,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  recruiter_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  resume_id UUID NULL,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_outreach_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email history"
  ON public.email_outreach_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email history"
  ON public.email_outreach_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own email history"
  ON public.email_outreach_history FOR DELETE
  USING (auth.uid() = user_id);
