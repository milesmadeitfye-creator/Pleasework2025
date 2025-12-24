// src/config/storage.ts

// SINGLE SOURCE OF TRUTH for Unreleased Music audio storage
// This MUST match the bucket id that exists in Supabase:
//   Bucket: 'unreleased-music' (created in migration 20251121015258)
//   Settings: Public = true (allows unauthenticated playback)
//   Policies: Public read, authenticated upload to own folder
//
// Used by:
//   1. Frontend upload (UnreleasedMusic component)
//   2. Backend upload (Netlify functions if any)
//   3. Playback URL generation (dashboard + public pages)

export const UNRELEASED_AUDIO_BUCKET = "unreleased-music";

// Legacy export for backward compatibility
export const UNRELEASED_BUCKET = UNRELEASED_AUDIO_BUCKET;

// To run once in Supabase SQL editor if public reads are needed:
//
// -- Ensure bucket allows public read access
// UPDATE storage.buckets
// SET public = true
// WHERE id = 'REPLACE_WITH_REAL_BUCKET_ID_FROM_SUPABASE';
//
// -- Add public read policy
// CREATE POLICY "public read unreleased bucket"
// ON storage.objects
// FOR SELECT
// TO public
// USING (bucket_id = 'REPLACE_WITH_REAL_BUCKET_ID_FROM_SUPABASE');
//
// -- Allow authenticated users to upload to their own folder
// CREATE POLICY "authenticated upload unreleased bucket"
// ON storage.objects
// FOR INSERT
// TO authenticated
// WITH CHECK (
//   bucket_id = 'REPLACE_WITH_REAL_BUCKET_ID_FROM_SUPABASE'
//   AND (storage.foldername(name))[1] = auth.uid()::text
// );
