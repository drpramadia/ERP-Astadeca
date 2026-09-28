-- 029_receiving_qc_rls_hardening.sql
-- Phase 033 — RLS hardening for receiving + QC domain.
--
-- Goal: replace the lumped FOR ALL org-member policies (which allowed any
-- organization member to INSERT/UPDATE/DELETE receiving/QC rows) with:
--   * SELECT  -> any active member of the owning organization
--   * WRITE   -> members holding the receiving/QC business permission
--
-- Idempotent and non-destructive: only DROP/CREATE POLICY statements.
-- No table, column, data, or RLS-enablement changes.
--
-- Authorization reuses the existing model only:
--   is_org_member(org)         -> active organization membership
--   has_org_permission(org, c) -> role_permissions join (DIRECTOR bypass included)
--
-- NOTE: dedicated `receiving.*` / `qc.*` permission codes do NOT exist in the
-- remote `permissions` table. The closest existing code covering the
-- receiving+QC workflow is `inventory.receive`. It is used here instead of
-- inventing new codes. See PHASE 033 report for the follow-up RBAC gap.

BEGIN;

-- ---------------------------------------------------------------------------
-- receiving_records
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rr_all ON public.receiving_records;
DROP POLICY IF EXISTS receiving_records_select ON public.receiving_records;
DROP POLICY IF EXISTS receiving_records_insert ON public.receiving_records;
DROP POLICY IF EXISTS receiving_records_update ON public.receiving_records;
DROP POLICY IF EXISTS receiving_records_delete ON public.receiving_records;

CREATE POLICY receiving_records_select ON public.receiving_records
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY receiving_records_insert ON public.receiving_records
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_permission(organization_id, 'inventory.receive'));

CREATE POLICY receiving_records_update ON public.receiving_records
  FOR UPDATE TO authenticated
  USING (public.has_org_permission(organization_id, 'inventory.receive'))
  WITH CHECK (public.has_org_permission(organization_id, 'inventory.receive'));

CREATE POLICY receiving_records_delete ON public.receiving_records
  FOR DELETE TO authenticated
  USING (public.has_org_permission(organization_id, 'inventory.receive'));

-- ---------------------------------------------------------------------------
-- receiving_items  (organization resolved via parent receiving_records)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ri_all ON public.receiving_items;
DROP POLICY IF EXISTS receiving_items_select ON public.receiving_items;
DROP POLICY IF EXISTS receiving_items_insert ON public.receiving_items;
DROP POLICY IF EXISTS receiving_items_update ON public.receiving_items;
DROP POLICY IF EXISTS receiving_items_delete ON public.receiving_items;

CREATE POLICY receiving_items_select ON public.receiving_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.receiving_records rr
      WHERE rr.id = receiving_items.receiving_id
        AND public.is_org_member(rr.organization_id)
    )
  );

CREATE POLICY receiving_items_insert ON public.receiving_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.receiving_records rr
      WHERE rr.id = receiving_items.receiving_id
        AND public.has_org_permission(rr.organization_id, 'inventory.receive')
    )
  );

CREATE POLICY receiving_items_update ON public.receiving_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.receiving_records rr
      WHERE rr.id = receiving_items.receiving_id
        AND public.has_org_permission(rr.organization_id, 'inventory.receive')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.receiving_records rr
      WHERE rr.id = receiving_items.receiving_id
        AND public.has_org_permission(rr.organization_id, 'inventory.receive')
    )
  );

CREATE POLICY receiving_items_delete ON public.receiving_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.receiving_records rr
      WHERE rr.id = receiving_items.receiving_id
        AND public.has_org_permission(rr.organization_id, 'inventory.receive')
    )
  );

-- ---------------------------------------------------------------------------
-- qc_inspections
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS qi_all ON public.qc_inspections;
DROP POLICY IF EXISTS qc_inspections_select ON public.qc_inspections;
DROP POLICY IF EXISTS qc_inspections_insert ON public.qc_inspections;
DROP POLICY IF EXISTS qc_inspections_update ON public.qc_inspections;
DROP POLICY IF EXISTS qc_inspections_delete ON public.qc_inspections;

CREATE POLICY qc_inspections_select ON public.qc_inspections
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY qc_inspections_insert ON public.qc_inspections
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_permission(organization_id, 'inventory.receive'));

CREATE POLICY qc_inspections_update ON public.qc_inspections
  FOR UPDATE TO authenticated
  USING (public.has_org_permission(organization_id, 'inventory.receive'))
  WITH CHECK (public.has_org_permission(organization_id, 'inventory.receive'));

CREATE POLICY qc_inspections_delete ON public.qc_inspections
  FOR DELETE TO authenticated
  USING (public.has_org_permission(organization_id, 'inventory.receive'));

COMMIT;
