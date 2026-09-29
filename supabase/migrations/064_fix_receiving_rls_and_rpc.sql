-- Migration: 064_fix_receiving_rls_and_rpc.sql
--
-- Critical bugs blocking receiving workflow for non-admin users:
-- 1. receiving_records + receiving_items have NO RLS policies → all reads/writes denied
-- 2. create_receiving_from_po p_created_by has no DEFAULT → null user_id causes DB error
-- 3. apply_qc_inspection p_performed_by has no DEFAULT → null inspector crashes RPC
--
-- Date: 2026-09-29

-- ============================================================
-- 1. RLS policies for receiving_records
-- ============================================================
ALTER TABLE public.receiving_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receiving_records_select ON public.receiving_records;
CREATE POLICY receiving_records_select ON public.receiving_records
  FOR SELECT USING (public.has_org_permission(organization_id, 'operational.view'));

DROP POLICY IF EXISTS receiving_records_insert ON public.receiving_records;
CREATE POLICY receiving_records_insert ON public.receiving_records
  FOR INSERT WITH CHECK (public.has_org_permission(organization_id, 'inventory.receive'));

DROP POLICY IF EXISTS receiving_records_update ON public.receiving_records;
CREATE POLICY receiving_records_update ON public.receiving_records
  FOR UPDATE USING (public.has_org_permission(organization_id, 'inventory.receive'))
  WITH CHECK (public.has_org_permission(organization_id, 'inventory.receive'));

DROP POLICY IF EXISTS receiving_records_delete ON public.receiving_records;
CREATE POLICY receiving_records_delete ON public.receiving_records
  FOR DELETE USING (public.has_org_permission(organization_id, 'inventory.receive'));

-- ============================================================
-- 2. RLS policies for receiving_items
-- ============================================================
ALTER TABLE public.receiving_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS receiving_items_select ON public.receiving_items;
CREATE POLICY receiving_items_select ON public.receiving_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.receiving_records rr
      WHERE rr.id = receiving_items.receiving_id
        AND public.has_org_permission(rr.organization_id, 'operational.view')
    )
  );

DROP POLICY IF EXISTS receiving_items_insert ON public.receiving_items;
CREATE POLICY receiving_items_insert ON public.receiving_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.receiving_records rr
      WHERE rr.id = receiving_items.receiving_id
        AND public.has_org_permission(rr.organization_id, 'inventory.receive')
    )
  );

DROP POLICY IF EXISTS receiving_items_update ON public.receiving_items;
CREATE POLICY receiving_items_update ON public.receiving_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.receiving_records rr
      WHERE rr.id = receiving_items.receiving_id
        AND public.has_org_permission(rr.organization_id, 'inventory.receive')
    )
  );

DROP POLICY IF EXISTS receiving_items_delete ON public.receiving_items;
CREATE POLICY receiving_items_delete ON public.receiving_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.receiving_records rr
      WHERE rr.id = receiving_items.receiving_id
        AND public.has_org_permission(rr.organization_id, 'inventory.receive')
    )
  );

-- ============================================================
-- 3. RLS policies for qc_inspections (ensure read is covered)
-- ============================================================
DROP POLICY IF EXISTS qc_inspections_select ON public.qc_inspections;
CREATE POLICY qc_inspections_select ON public.qc_inspections
  FOR SELECT USING (public.has_org_permission(organization_id, 'operational.view'));

DROP POLICY IF EXISTS qc_inspections_insert ON public.qc_inspections;
CREATE POLICY qc_inspections_insert ON public.qc_inspections
  FOR INSERT WITH CHECK (public.has_org_permission(organization_id, 'operational.view'));

DROP POLICY IF EXISTS qc_inspections_update ON public.qc_inspections;
CREATE POLICY qc_inspections_update ON public.qc_inspections
  FOR UPDATE USING (
    public.has_org_permission(organization_id, 'inventory.receive')
    OR auth.uid() = inspector_id
  );

-- ============================================================
-- 4. Fix RPC signatures: add DEFAULT auth.uid() to p_created_by
-- ============================================================
-- create_receiving_from_po
DROP FUNCTION IF EXISTS public.create_receiving_from_po(uuid, date, jsonb, uuid);
CREATE OR REPLACE FUNCTION public.create_receiving_from_po(
  p_po_id         uuid,
  p_received_date date    DEFAULT CURRENT_DATE,
  p_items         jsonb  DEFAULT '[]'::jsonb,
  p_created_by    uuid   DEFAULT auth.uid()
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rr_id       uuid;
  v_rr_number   text;
  v_seq         int;
  v_item        jsonb;
  v_supplier_id uuid;
  v_org_id      uuid;
BEGIN
  SELECT supplier_id, organization_id INTO v_supplier_id, v_org_id
  FROM purchase_orders WHERE id = p_po_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_po_id, 'ERROR: PO not found'::text;
    RETURN;
  END IF;

  SELECT nextval('document_number_seq') INTO v_seq;
  v_rr_number := 'GR-' || to_char(NOW(), 'YYYY') || '-' || LPAD(v_seq::text, 6, '0');

  INSERT INTO receiving_records (
    organization_id, receiving_number, po_id, supplier_id, status,
    received_date, created_by, created_at
  ) VALUES (
    v_org_id, v_rr_number, p_po_id, v_supplier_id, 'PENDING',
    p_received_date, p_created_by, now()
  ) RETURNING id INTO v_rr_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO receiving_items (
      receiving_id, po_item_id, product_id, batch_number, quantity, actual_quantity,
      unit_id, cold_storage_id, storage_location_id, production_date, expiry_date,
      qc_status, created_at
    ) VALUES (
      v_rr_id,
      NULLIF(v_item->>'po_item_id', '')::uuid,
      (v_item->>'product_id')::uuid,
      v_item->>'batch_number',
      COALESCE((v_item->>'quantity')::numeric, 0),
      COALESCE((v_item->>'actual_quantity')::numeric, 0),
      NULLIF(v_item->>'unit_id', '')::uuid,
      NULLIF(v_item->>'cold_storage_id', '')::uuid,
      NULLIF(v_item->>'storage_location_id', '')::uuid,
      NULLIF(v_item->>'production_date', '')::date,
      NULLIF(v_item->>'expiry_date', '')::date,
      COALESCE(v_item->>'qc_status', 'PENDING'),
      now()
    );
  END LOOP;

  RETURN QUERY SELECT v_rr_id, ('OK: GR ' || v_rr_number || ' created')::text;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_receiving_from_po TO authenticated;
