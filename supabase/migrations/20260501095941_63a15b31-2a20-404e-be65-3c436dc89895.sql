-- 1) Make the unused 'email-assets' bucket private to prevent unauthenticated reads
UPDATE storage.buckets SET public = false WHERE id = 'email-assets';

-- 2) Restrict EXECUTE on the SECURITY DEFINER has_role function:
--    Revoke from PUBLIC and anon so unauthenticated users cannot call it via the API.
--    Authenticated users (and the service role) retain EXECUTE so RLS policies and app code work.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;