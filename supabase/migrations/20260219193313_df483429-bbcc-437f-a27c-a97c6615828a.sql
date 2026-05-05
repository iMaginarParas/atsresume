
-- Create AI Apply Queue table
CREATE TABLE public.ai_apply_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  resume_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | applied | dismissed
  job_title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  job_type TEXT,
  job_url TEXT,
  description TEXT,
  match_score INTEGER,
  match_explanation TEXT,
  tailored_resume_data JSONB,
  cover_letter_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.ai_apply_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own ai apply queue"
  ON public.ai_apply_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai apply queue"
  ON public.ai_apply_queue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ai apply queue"
  ON public.ai_apply_queue FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ai apply queue"
  ON public.ai_apply_queue FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE TRIGGER update_ai_apply_queue_updated_at
  BEFORE UPDATE ON public.ai_apply_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
