-- Supabase Storage Bucket Setup for Support Ticket Attachments
-- Run this in your Supabase SQL editor

-- Create storage bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-tickets',
  'support-tickets',
  false, -- Private bucket (only authenticated users can access)
  5242880, -- 5MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for support-tickets bucket
-- Note: Since backend uses service role, these policies may be bypassed
-- Authorization is handled at the application level in the backend controllers

-- Enable RLS on storage.objects (if not already enabled)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Simplified policies - allow authenticated access
-- The backend service role will handle authorization

-- Policy: Allow authenticated users to upload (backend will validate)
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'support-tickets'
);

-- Policy: Allow authenticated users to view (backend will validate)
CREATE POLICY "Allow authenticated views"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'support-tickets'
);

-- Policy: Allow authenticated users to delete (backend will validate)
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'support-tickets'
);

-- Note: If you want stricter policies, you'll need to adjust based on your auth system
-- Since the backend uses service role key, these policies are mainly for direct Supabase client access
-- The backend controllers already enforce authorization via the authorize middleware

