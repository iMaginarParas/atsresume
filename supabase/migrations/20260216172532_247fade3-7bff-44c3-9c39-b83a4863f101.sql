-- Make resume-photos bucket public so getPublicUrl works
UPDATE storage.buckets SET public = true WHERE id = 'resume-photos';

-- Ensure RLS policies exist for uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can upload resume photos'
  ) THEN
    CREATE POLICY "Users can upload resume photos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'resume-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can update their resume photos'
  ) THEN
    CREATE POLICY "Users can update their resume photos"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'resume-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Resume photos are publicly readable'
  ) THEN
    CREATE POLICY "Resume photos are publicly readable"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'resume-photos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Users can delete their resume photos'
  ) THEN
    CREATE POLICY "Users can delete their resume photos"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'resume-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;