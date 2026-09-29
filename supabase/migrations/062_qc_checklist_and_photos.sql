-- Migration: 062_qc_checklist_and_photos.sql
--
-- QC workflow now includes:
--   1. A structured checklist of condition items (packaging, temperature, expiry,
--      appearance, etc.) stored as JSONB in qc_inspections.checklist_data.
--   2. Photo evidence uploaded to Supabase Storage, stored as JSONB array of
--      URLs in qc_inspections.evidence_photos.
--   3. A "Buat QC" button on the receiving detail page to create inspection
--      directly from a GR, not from the QC list.
--
-- Checklist items (all nullable; inspector fills what applies):
--   packaging_condition  : "Baik" | "Rusak" | "Tidak Lengkap"
--   temperature_reading  : numeric (°C)
--   temperature_note     : text
--   expiry_check         : "Lulus" | "Kedaluwarsa" | "MendekatiExpiry"
--   appearance           : "Baik" | "Kurang" | "Buruk"
--   weight_match         : boolean (actual weight matches label)
--   document_complete    : boolean (coa/sertifikat halal present)
--   items[]              : per-item results
--     item_name          : text
--     item_status        : "PASS" | "FAIL" | "CONDITIONAL"
--     item_notes         : text
--
-- Date: 2026-09-29

-- ============================================================
-- 1. Extend qc_inspections table
-- ============================================================
ALTER TABLE public.qc_inspections
  ADD COLUMN IF NOT EXISTS checklist_data jsonb NULL,
  ADD COLUMN IF NOT EXISTS evidence_photos jsonb NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.qc_inspections.checklist_data IS
  'Structured QC checklist: packaging, temperature, expiry, appearance, etc. and per-item results.';
COMMENT ON COLUMN public.qc_inspections.evidence_photos IS
  'JSONB array of Supabase Storage URLs for photo evidence.';

-- ============================================================
-- 2. Enable RLS on new columns
-- ============================================================
ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qc_inspections_update ON public.qc_inspections;
CREATE POLICY qc_inspections_update ON public.qc_inspections
  FOR UPDATE USING (
    public.has_org_permission(organization_id, 'inventory.receive')
    OR auth.uid() = inspector_id
  )
  WITH CHECK (
    public.has_org_permission(organization_id, 'inventory.receive')
    OR auth.uid() = inspector_id
  );

DROP POLICY IF EXISTS qc_inspections_select ON public.qc_inspections;
CREATE POLICY qc_inspections_select ON public.qc_inspections
  FOR SELECT USING (public.has_org_permission(organization_id, 'operational.view'));

-- ============================================================
-- 3. Create storage bucket for QC evidence photos
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('qc-evidence', 'qc-evidence', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS qc_evidence_insert ON storage.objects;
CREATE POLICY qc_evidence_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'qc-evidence'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS qc_evidence_select ON storage.objects;
CREATE POLICY qc_evidence_select ON storage.objects
  FOR SELECT USING (bucket_id = 'qc-evidence');

DROP POLICY IF EXISTS qc_evidence_delete ON storage.objects;
CREATE POLICY qc_evidence_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'qc-evidence');

-- ============================================================
-- 4. create_qc_from_receiving RPC (idempotent — one QC per GR)
-- Called from receiving detail page to open a new inspection.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_qc_from_receiving(
  p_receiving_id  uuid,
  p_inspector_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org_id   uuid;
  v_existing uuid;
  v_id       uuid;
  v_seq      int;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM receiving_records WHERE id = p_receiving_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Receiving record % not found', p_receiving_id;
  END IF;

  -- Idempotent: return existing
  SELECT id INTO v_existing FROM qc_inspections WHERE receiving_id = p_receiving_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT COALESCE(MAX(SUBSTRING(qc_number FROM 10 FOR 4))::int, 0) + 1
    INTO v_seq
  FROM qc_inspections
  WHERE organization_id = v_org_id
    AND qc_number LIKE 'QC-' || to_char(NOW(), 'YYYYMMDD') || '-%';

  INSERT INTO qc_inspections (
    organization_id, receiving_id, qc_number,
    status, inspector_id, created_at
  ) VALUES (
    v_org_id, p_receiving_id,
    'QC-' || to_char(NOW(), 'YYYYMMDD') || '-' || LPAD(v_seq::text, 4, '0'),
    'PENDING',
    COALESCE(p_inspector_id, auth.uid()),
    now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_qc_inspection TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_qc_from_receiving TO authenticated;
