
-- Add apply_method column to track how each job was auto-applied
ALTER TABLE public.ai_apply_queue 
ADD COLUMN IF NOT EXISTS apply_method text DEFAULT 'manual';

-- Add apply_error column for failed auto-apply attempts
ALTER TABLE public.ai_apply_queue 
ADD COLUMN IF NOT EXISTS apply_error text;
