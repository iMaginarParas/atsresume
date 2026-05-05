
CREATE TABLE public.pinned_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  company_logo TEXT,
  company_website TEXT,
  company_type TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, company_name)
);

ALTER TABLE public.pinned_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pinned companies" ON public.pinned_companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pinned companies" ON public.pinned_companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own pinned companies" ON public.pinned_companies FOR DELETE USING (auth.uid() = user_id);
