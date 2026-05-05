
-- Add attachments column to email_outreach_history to store additional document metadata
ALTER TABLE public.email_outreach_history 
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT NULL;
