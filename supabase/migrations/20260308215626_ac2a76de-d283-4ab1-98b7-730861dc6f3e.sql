
-- Drop the existing permissive INSERT policy
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;

-- Create restricted INSERT policy: users can only self-assign 'job_seeker'
CREATE POLICY "Users can insert own role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND role = 'job_seeker'
);
