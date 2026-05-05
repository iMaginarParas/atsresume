-- Drop the foreign key constraint on user_roles that references auth.users
-- This prevents issues when auth user records are not yet synced
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;
