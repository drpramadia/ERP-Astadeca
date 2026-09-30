-- Migration: 066_qc_evidence_bucket_public.sql
-- Fix: qc-evidence bucket was created with public=false, making getPublicUrl()
-- return inaccessible URLs. Making it public simplifies access for internal
-- QC evidence photos. For a stricter approach, keep false and ensure signed
-- URLs are refreshed on each page load.
-- Date: 2026-09-30

UPDATE storage.buckets
SET public = true
WHERE id = 'qc-evidence';

-- Relax insert policy: any authenticated user can upload to this bucket
DROP POLICY IF EXISTS qc_evidence_insert ON storage.objects;
CREATE POLICY qc_evidence_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'qc-evidence'
    AND auth.role() = 'authenticated'
  );

-- Public read (bucket is now public)
DROP POLICY IF EXISTS qc_evidence_select ON storage.objects;
CREATE POLICY qc_evidence_select ON storage.objects
  FOR SELECT USING (bucket_id = 'qc-evidence');

-- Allow delete by authenticated users
DROP POLICY IF EXISTS qc_evidence_delete ON storage.objects;
CREATE POLICY qc_evidence_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'qc-evidence'
    AND auth.uid() IS NOT NULL
  );
