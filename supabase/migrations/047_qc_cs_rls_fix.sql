-- Migration: 043b_qc_cs_rls_fix.sql
-- Fixes P1 security issue: qc_cs_checklist_templates and qc_cs_receiving_results
-- were created in 043 without ENABLE ROW LEVEL SECURITY and no policies.
-- Also enables RLS on storage_locations (was already enabled, this just verifies).
-- Date: 2026-09-29

-- ============================================================
-- 1. ENABLE RLS on qc_cs_checklist_templates
-- ============================================================
ALTER TABLE public.qc_cs_checklist_templates ENABLE ROW LEVEL SECURITY;

-- Read: org members can view templates
DROP POLICY IF EXISTS "qc_cs_templates_read" ON public.qc_cs_checklist_templates;
CREATE POLICY "qc_cs_templates_read"
  ON public.qc_cs_checklist_templates FOR SELECT
  USING (public.is_org_member(organization_id));

-- Insert: only admin (SUPER_USER/DIRECTOR) can create templates
DROP POLICY IF EXISTS "qc_cs_templates_insert" ON public.qc_cs_checklist_templates;
CREATE POLICY "qc_cs_templates_insert"
  ON public.qc_cs_checklist_templates FOR INSERT
  WITH CHECK (
    public.is_super_user()
    OR public.has_org_permission(organization_id, 'admin.settings')
  );

-- Update: only admin can modify templates
DROP POLICY IF EXISTS "qc_cs_templates_update" ON public.qc_cs_checklist_templates;
CREATE POLICY "qc_cs_templates_update"
  ON public.qc_cs_checklist_templates FOR UPDATE
  USING (
    public.is_super_user()
    OR public.has_org_permission(organization_id, 'admin.settings')
  )
  WITH CHECK (
    public.is_super_user()
    OR public.has_org_permission(organization_id, 'admin.settings')
  );

-- Delete: only admin can delete templates
DROP POLICY IF EXISTS "qc_cs_templates_delete" ON public.qc_cs_checklist_templates;
CREATE POLICY "qc_cs_templates_delete"
  ON public.qc_cs_checklist_templates FOR DELETE
  USING (
    public.is_super_user()
    OR public.has_org_permission(organization_id, 'admin.settings')
  );

-- ============================================================
-- 2. ENABLE RLS on qc_cs_receiving_results
--    Access is via receiving records, so org-scoped read is fine.
--    Insert/update: QC staff or above.
-- ============================================================
ALTER TABLE public.qc_cs_receiving_results ENABLE ROW LEVEL SECURITY;

-- Read: org members can view QC results linked to their org's receiving
DROP POLICY IF EXISTS "qc_cs_results_read" ON public.qc_cs_receiving_results;
CREATE POLICY "qc_cs_results_read"
  ON public.qc_cs_receiving_results FOR SELECT
  USING (
    receiving_id IN (
      SELECT im.id FROM public.inventory_movements im
      WHERE im.organization_id = (
        SELECT im2.organization_id FROM public.inventory_movements im2
        WHERE im2.id = qc_cs_receiving_results.receiving_id
      )
    )
  );

-- Insert: warehouse/QC staff can record QC results
DROP POLICY IF EXISTS "qc_cs_results_insert" ON public.qc_cs_receiving_results;
CREATE POLICY "qc_cs_results_insert"
  ON public.qc_cs_receiving_results FOR INSERT
  WITH CHECK (
    public.is_super_user()
    OR public.has_org_permission(
      (SELECT organization_id FROM public.inventory_movements WHERE id = receiving_id),
      'inventory.receive'
    )
  );

-- Update: QC results can be edited by the creator or admin
DROP POLICY IF EXISTS "qc_cs_results_update" ON public.qc_cs_receiving_results;
CREATE POLICY "qc_cs_results_update"
  ON public.qc_cs_receiving_results FOR UPDATE
  USING (
    public.is_super_user()
    OR performed_by = auth.uid()
    OR public.has_org_permission(
      (SELECT organization_id FROM public.inventory_movements WHERE id = receiving_id),
      'admin.settings'
    )
  );

-- ============================================================
-- 3. Ensure storage_locations RLS is enabled (defensive)
-- ============================================================
ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Grant table permissions to authenticated role
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qc_cs_checklist_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.qc_cs_receiving_results TO authenticated;
