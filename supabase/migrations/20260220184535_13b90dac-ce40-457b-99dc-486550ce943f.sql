
-- Create ai_apply_campaigns table
CREATE TABLE IF NOT EXISTS public.ai_apply_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  resume_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | failed
  location TEXT,
  job_type TEXT,
  min_score INTEGER NOT NULL DEFAULT 60,
  max_applications INTEGER NOT NULL DEFAULT 20,
  jobs_searched INTEGER NOT NULL DEFAULT 0,
  jobs_scored INTEGER NOT NULL DEFAULT 0,
  jobs_queued INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_apply_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own campaigns"
  ON public.ai_apply_campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaigns"
  ON public.ai_apply_campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaigns"
  ON public.ai_apply_campaigns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
  ON public.ai_apply_campaigns FOR DELETE
  USING (auth.uid() = user_id);

-- Add campaign_id to ai_apply_queue
ALTER TABLE public.ai_apply_queue
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.ai_apply_campaigns(id) ON DELETE SET NULL;

-- Auto-update timestamp trigger
CREATE TRIGGER update_ai_apply_campaigns_updated_at
  BEFORE UPDATE ON public.ai_apply_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
