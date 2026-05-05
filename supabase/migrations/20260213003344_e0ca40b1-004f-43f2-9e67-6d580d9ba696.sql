-- Make resume-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'resume-photos';

-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Resume photos are publicly accessible" ON storage.objects;

-- Create user-scoped SELECT policy
CREATE POLICY "Users can view own resume photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'resume-photos' AND auth.uid()::text = (storage.foldername(name))[1]);