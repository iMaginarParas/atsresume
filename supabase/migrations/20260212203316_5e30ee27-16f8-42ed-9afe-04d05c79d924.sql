
-- Create storage bucket for resume profile photos
INSERT INTO storage.buckets (id, name, public) VALUES ('resume-photos', 'resume-photos', true);

-- Allow authenticated users to upload their own photos
CREATE POLICY "Users can upload own resume photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'resume-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to update their own photos
CREATE POLICY "Users can update own resume photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'resume-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow authenticated users to delete their own photos
CREATE POLICY "Users can delete own resume photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'resume-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow public read access to resume photos
CREATE POLICY "Resume photos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'resume-photos');
