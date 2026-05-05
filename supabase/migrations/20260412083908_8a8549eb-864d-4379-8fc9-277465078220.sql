
-- 1. Fix resume-photos storage policies: remove duplicates and change to authenticated role
DROP POLICY IF EXISTS "Users can delete own resume photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their resume photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own resume photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their resume photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own resume photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload resume photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own resume photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own resume photos" ON storage.objects;

CREATE POLICY "Users can read own resume photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'resume-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can upload own resume photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'resume-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own resume photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'resume-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own resume photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'resume-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
