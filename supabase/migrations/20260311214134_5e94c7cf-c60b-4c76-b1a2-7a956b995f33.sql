
-- Make resume-photos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'resume-photos';

-- Drop the unrestricted public SELECT policy
DROP POLICY IF EXISTS "Resume photos are publicly readable" ON storage.objects;

-- Add a user-scoped SELECT policy so users can read their own photos via signed URLs
CREATE POLICY "Users can read own resume photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resume-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
