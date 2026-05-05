
-- Create cover_letters table
CREATE TABLE public.cover_letters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  resume_id UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
  job_description TEXT,
  tone TEXT NOT NULL DEFAULT 'professional',
  cover_letter_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cover_letters ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own cover letters"
ON public.cover_letters FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cover letters"
ON public.cover_letters FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cover letters"
ON public.cover_letters FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own cover letters"
ON public.cover_letters FOR DELETE
USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE TRIGGER update_cover_letters_updated_at
BEFORE UPDATE ON public.cover_letters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add cover_letter_id to job_applications
ALTER TABLE public.job_applications
ADD COLUMN cover_letter_id UUID REFERENCES public.cover_letters(id) ON DELETE SET NULL;
