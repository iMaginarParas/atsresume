
CREATE TABLE public.payment_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id text NOT NULL,
  token text NOT NULL UNIQUE,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_tokens ENABLE ROW LEVEL SECURITY;

-- No client-side access policies - only service role can read/write
