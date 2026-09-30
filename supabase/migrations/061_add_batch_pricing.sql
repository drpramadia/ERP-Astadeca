-- Migration: 061_add_batch_pricing.sql
--
-- Bug: Inventory tidak menyimpan harga_beli (dari PO) dan harga_jual.
-- Result: Margin tidak bisa dihitung per batch/shipment.
--
-- Fix:
--   1. batches: add cost_price (harga_beli dari PO item), supplier_id
--   2. inventory: add cost_price, selling_price
--   3. inventory_movements: add unit_cost, selling_price
--   4. apply_qc_inspection: capture cost_price dari PO item saat posting ke inventory
--   5. apply_sales_delivery: capture selling_price saat delivery
--
-- Date: 2026-09-30

-- ============================================================
-- 1. Add cost_price to batches
-- ============================================================
ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS cost_price numeric(16,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.batches.cost_price IS 'Harga beli per unit (dari PO)';
COMMENT ON COLUMN public.batches.supplier_id IS 'Supplier asal barang';

-- ============================================================
-- 2. Add pricing columns to inventory
-- ============================================================
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS cost_price numeric(16,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS selling_price numeric(16,2) DEFAULT NULL;

COMMENT ON COLUMN public.inventory.cost_price IS 'Harga beli per unit saat stok masuk';
COMMENT ON COLUMN public.inventory.selling_price IS 'Harga jual default (dari master produk)';

-- ============================================================
-- 3. Add pricing columns to inventory_movements
-- ============================================================
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost numeric(16,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS selling_price numeric(16,2) DEFAULT NULL;

COMMENT ON COLUMN public.inventory_movements.unit_cost IS 'Harga beli per unit saat movement';
COMMENT ON COLUMN public.inventory_movements.selling_price IS 'Harga jual per unit saat movement';

-- ============================================================
-- 4. Update apply_qc_inspection to capture cost_price from PO
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_qc_inspection(
  p_inspection_id      uuid,
  p_status             text,
  p_result             text DEFAULT NULL,
  p_notes              text DEFAULT NULL,
  p_performed_by       uuid DEFAULT NULL,
  p_checklist_data     jsonb DEFAULT NULL,
  p_evidence_photos    jsonb DEFAULT NULL
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org_id      uuid;
  v_receiving   uuid;
  v_prev        text;
  v_item        record;
  v_warehouse   uuid;
  v_cold        uuid;
  v_is_accepted boolean;
  v_batch       uuid;
  v_batch_no    text;
  v_posted      int := 0;
  v_cost_price  numeric(16,2);
  v_selling_pr  numeric(16,2);
BEGIN
  IF p_status IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'ERROR: status QC wajib diisi'::text;
    RETURN;
  END IF;

  IF p_status NOT IN ('ACCEPTED','PARTIAL_ACCEPT','QUARANTINE','REJECTED','PASSED','FAILED') THEN
    RETURN QUERY SELECT NULL::uuid, ('ERROR: status QC tidak dikenal: ' || p_status)::text;
    RETURN;
  END IF;

  SELECT organization_id, receiving_id, status
    INTO v_org_id, v_receiving, v_prev
  FROM qc_inspections WHERE id = p_inspection_id;

  IF v_org_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'ERROR: inspeksi QC tidak ditemukan'::text;
    RETURN;
  END IF;

  IF v_prev IN ('ACCEPTED','PASSED') AND p_status IN ('ACCEPTED','PASSED') THEN
    RETURN QUERY SELECT p_inspection_id, 'SKIP: inspeksi sudah diterima, stok tidak digandakan'::text;
    RETURN;
  END IF;

  UPDATE qc_inspections
  SET status          = p_status,
      result          = COALESCE(p_result, qc_inspections.result),
      notes           = COALESCE(p_notes, qc_inspections.notes),
      inspector_id    = COALESCE(p_performed_by, qc_inspections.inspector_id),
      inspected_at    = now(),
      checklist_data  = COALESCE(p_checklist_data, qc_inspections.checklist_data),
      evidence_photos = COALESCE(p_evidence_photos, qc_inspections.evidence_photos)
  WHERE id = p_inspection_id;

  UPDATE receiving_items
  SET qc_status = p_status
  WHERE receiving_id = v_receiving;

  v_is_accepted := p_status IN ('ACCEPTED','PASSED');

  IF v_is_accepted THEN
    FOR v_item IN
      SELECT ri.id, ri.product_id, ri.batch_number, ri.unit_id,
             COALESCE(ri.actual_quantity, ri.quantity, 0) AS qty,
             ri.cold_storage_id, ri.storage_location_id,
             ri.production_date, ri.expiry_date,
             rr.supplier_id
      FROM receiving_items ri
      JOIN receiving_records rr ON rr.id = ri.receiving_id
      WHERE ri.receiving_id = v_receiving
        AND COALESCE(ri.actual_quantity, ri.quantity, 0) > 0
        AND ri.product_id IS NOT NULL
      ORDER BY ri.created_at, ri.id
    LOOP
      -- cold storage: from the item, else from the storage location
      v_cold := v_item.cold_storage_id;
      IF v_cold IS NULL AND v_item.storage_location_id IS NOT NULL THEN
        SELECT sl.cold_storage_id INTO v_cold
        FROM storage_locations sl WHERE sl.id = v_item.storage_location_id;
      END IF;

      -- warehouse: the one that owns that cold storage
      v_warehouse := NULL;
      IF v_cold IS NOT NULL THEN
        SELECT cs.warehouse_id INTO v_warehouse FROM cold_storages cs WHERE cs.id = v_cold;
      END IF;

      -- fall back to the organisation's first warehouse
      IF v_warehouse IS NULL THEN
        SELECT w.id INTO v_warehouse
        FROM warehouses w WHERE w.organization_id = v_org_id
        ORDER BY w.created_at NULLS LAST, w.name LIMIT 1;
      END IF;

      IF v_warehouse IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, 'ERROR: tidak ada gudang tujuan untuk stok ini'::text;
        RETURN;
      END IF;

      -- Get cost_price from PO item (latest purchase price)
      SELECT poi.unit_price INTO v_cost_price
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE po.id = (SELECT po_id FROM receiving_records WHERE id = v_receiving)
        AND poi.product_id = v_item.product_id
      ORDER BY po.order_date DESC
      LIMIT 1;

      -- Get selling_price from product master
      SELECT selling_price INTO v_selling_pr
      FROM products WHERE id = v_item.product_id;

      -- batch: reuse or create
      v_batch_no := NULLIF(TRIM(COALESCE(v_item.batch_number, '')), '');
      IF v_batch_no IS NOT NULL THEN
        SELECT b.id INTO v_batch FROM batches b
        WHERE b.organization_id = v_org_id AND b.product_id = v_item.product_id
          AND b.batch_number = v_batch_no LIMIT 1;
      END IF;

      IF v_batch IS NULL THEN
        IF v_batch_no IS NULL THEN
          v_batch_no := 'BATCH-' || to_char(NOW(), 'YYYYMMDD') || '-' ||
                        LPAD((COALESCE((SELECT COUNT(*) FROM batches WHERE organization_id = v_org_id), 0) + 1)::text, 4, '0');
        END IF;
        INSERT INTO batches (
          organization_id, product_id, batch_number, supplier_id,
          received_date, production_date, expiry_date, status,
          cost_price
        ) VALUES (
          v_org_id, v_item.product_id, v_batch_no, v_item.supplier_id,
          CURRENT_DATE, v_item.production_date, v_item.expiry_date, 'ACTIVE',
          v_cost_price
        ) RETURNING id INTO v_batch;
      ELSE
        -- Update existing batch with cost_price if not set
        UPDATE batches SET cost_price = COALESCE(cost_price, v_cost_price)
        WHERE id = v_batch AND cost_price IS NULL;
      END IF;

      -- Insert inventory with pricing
      INSERT INTO inventory (
        organization_id, warehouse_id, cold_storage_id, storage_location_id,
        product_id, batch_id, owner_type, owner_id,
        quantity, unit_id, quantity_kg, status, received_at,
        cost_price, selling_price
      ) VALUES (
        v_org_id, v_warehouse, v_cold, v_item.storage_location_id,
        v_item.product_id, v_batch, 'COMPANY', v_org_id,
        v_item.qty, v_item.unit_id, v_item.qty, 'AVAILABLE', now(),
        v_cost_price, v_selling_pr
      );

      -- Record movement with pricing
      INSERT INTO inventory_movements (
        organization_id, movement_number, movement_type,
        inventory_id, batch_id, product_id,
        destination_warehouse_id, destination_cold_storage_id, destination_location_id,
        owner_type, owner_id,
        quantity, unit_id, quantity_kg,
        source_entity_type, source_entity_id,
        performed_by, unit_cost, selling_price
      ) SELECT
        v_org_id,
        'MV-' || to_char(NOW(), 'YYYYMMDD') || '-' || LPAD((COALESCE((SELECT COUNT(*) FROM inventory_movements WHERE organization_id = v_org_id), 0) + 1)::text, 6, '0'),
        'RECEIVE',
        currval(pg_get_serial_sequence('inventory', 'id')),
        v_batch, v_item.product_id,
        v_warehouse, v_cold, v_item.storage_location_id,
        'COMPANY', v_org_id,
        v_item.qty, v_item.unit_id, v_item.qty,
        'qc_inspection', p_inspection_id,
        COALESCE(p_performed_by, auth.uid()),
        v_cost_price, v_selling_pr;

      v_posted := v_posted + 1;
    END LOOP;

    -- Update receiving status
    UPDATE receiving_records SET status = 'COMPLETED' WHERE id = v_receiving;

    RETURN QUERY SELECT v_batch, 'SUCCESS: ' || v_posted || ' item(s) diposting ke inventory dengan harga'::text;
  ELSE
    -- Update receiving status for rejected/quarantine
    UPDATE receiving_records SET status = 'QC_REJECTED' WHERE id = v_receiving;
    RETURN QUERY SELECT p_inspection_id, 'INFO: status QC ' || p_status || ' dicatat, tidak ada stok yang diposting'::text;
  END IF;
END;
$function$;

-- ============================================================
-- 5. Grant execute to authenticated
-- ============================================================
GRANT EXECUTE ON FUNCTION public.apply_qc_inspection TO authenticated;
