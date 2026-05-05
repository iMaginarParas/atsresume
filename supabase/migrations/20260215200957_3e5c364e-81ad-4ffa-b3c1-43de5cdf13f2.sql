-- Add a unique constraint on user_id alone so upsert works
-- First drop existing unique constraint on (user_id, role) if it exists
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- Add unique constraint on user_id (one role per user)
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);