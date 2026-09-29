-- Migration: 060_qc_inspection_posting.sql
--
-- Nothing in the database turned a goods receipt into stock. create_receiving_from_po()
-- only writes receiving_records (status PENDING) and receiving_items rows with
-- qc_status = 'PENDING'; the only functions that ever insert into `inventory` are
-- the transfer and return flows. So the chain stopped one step short:
--
--     PO -> receiving -> QC -> [nothing] -> inventory
--
-- and the Persediaan page could never show anything, because no code path created
-- an inventory row from a purchase receipt.
--
-- This migration adds the missing step:
--   * create_qc_inspection_from_receiving() opens the inspection for a receipt
--     (idempotent, one inspection per receipt),
--   * apply_qc_inspection() records the inspector's decision and, when the goods
--     are accepted, posts them into `inventory` against a batch, a cold storage
--     and a storage location - which is what the sync_inventory_levels() trigger
--     (fixed in 059) then rolls up into inventory_levels for the Persediaan page.
--
-- Values follow what the QC screen already renders: status ACCEPTED / REJECTED
-- (also PASSED / FAILED / QUARANTINE) and result PASS / FAIL / CONDITIONAL / HOLD.
--
-- Date: 2026-09-29

-- ============================================================
-- 1. Open an inspection for a goods receipt
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_qc_inspection_from_receiving(
  p_receiving_id uuid,
  p_inspector_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org_id   uuid;
  v_existing uuid;
  v_number   text;
  v_id       uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM receiving_records WHERE id = p_receiving_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Receiving record % not found', p_receiving_id;
  END IF;

  -- one inspection per receipt
  SELECT id INTO v_existing FROM qc_inspections WHERE receiving_id = p_receiving_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_number := 'QC-' || to_char(NOW(), 'YYYYMMDD') || '-' ||
              LPAD((COALESCE((SELECT COUNT(*) FROM qc_inspections WHERE organization_id = v_org_id), 0) + 1)::text, 4, '0');

  INSERT INTO qc_inspections (
    organization_id, receiving_id, qc_number, status, inspector_id, created_at
  ) VALUES (
    v_org_id, p_receiving_id, v_number, 'PENDING', p_inspector_id, now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ============================================================
-- 2. Record the QC decision and post accepted goods into stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_qc_inspection(
  p_inspection_id uuid,
  p_status        text,          -- ACCEPTED | PARTIAL_ACCEPT | QUARANTINE | REJECTED | PASSED | FAILED
  p_result        text DEFAULT NULL,  -- PASS | FAIL | CONDITIONAL | HOLD
  p_notes         text DEFAULT NULL,
  p_performed_by  uuid DEFAULT NULL
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

  -- `result` is also an OUT parameter of this function, so the column must be
  -- qualified or PL/pgSQL reports an ambiguous column reference (42702).
  UPDATE qc_inspections
  SET status       = p_status,
      result       = COALESCE(p_result, qc_inspections.result),
      notes        = COALESCE(p_notes, qc_inspections.notes),
      inspector_id = COALESCE(p_performed_by, qc_inspections.inspector_id),
      inspected_at = now()
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
             ri.production_date, ri.expiry_date
      FROM receiving_items ri
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

      -- a receipt must land somewhere; fall back to the organisation's first warehouse
      IF v_warehouse IS NULL THEN
        SELECT w.id INTO v_warehouse
        FROM warehouses w WHERE w.organization_id = v_org_id
        ORDER BY w.created_at NULLS LAST, w.name LIMIT 1;
      END IF;

      IF v_warehouse IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, 'ERROR: tidak ada gudang tujuan untuk stok ini'::text;
        RETURN;
      END IF;

      -- batch: reuse an existing one for this product, else create it
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
          organization_id, product_id, batch_number, received_date,
          production_date, expiry_date, status
        ) VALUES (
          v_org_id, v_item.product_id, v_batch_no, CURRENT_DATE,
          v_item.production_date, v_item.expiry_date, 'ACTIVE'
        ) RETURNING id INTO v_batch;
      END IF;

      INSERT INTO inventory (
        organization_id, warehouse_id, cold_storage_id, storage_location_id,
        product_id, batch_id, owner_type, owner_id,
        quantity, unit_id, quantity_kg, status, received_at
      ) VALUES (
        v_org_id, v_warehouse, v_cold, v_item.storage_location_id,
        v_item.product_id, v_batch, 'COMPANY', v_org_id,
        v_item.qty, v_item.unit_id, v_item.qty, 'AVAILABLE', now()
      );

      v_posted := v_posted + 1;
    END LOOP;

    UPDATE receiving_records
    SET status = 'APPROVED'
    WHERE id = v_receiving AND status <> 'APPROVED';
  ELSE
    UPDATE receiving_records
    SET status = 'REJECTED'
    WHERE id = v_receiving;
  END IF;

  INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_data)
  VALUES (v_org_id, p_performed_by, 'QC_INSPECTION_APPLIED', 'qc_inspection', p_inspection_id,
          jsonb_build_object('status', p_status, 'result', p_result, 'items_posted', v_posted));

  RETURN QUERY SELECT p_inspection_id,
    CASE WHEN v_is_accepted
         THEN 'SUCCESS: QC ' || p_status || ', ' || v_posted || ' baris stok masuk ke persediaan'
         ELSE 'SUCCESS: QC ' || p_status || ', stok tidak ditambahkan' END::text;
END;
$function$;

-- ============================================================
-- 3. Backfill: open inspections for receipts that never got one
-- ============================================================
INSERT INTO qc_inspections (organization_id, receiving_id, qc_number, status, created_at)
SELECT rr.organization_id,
       rr.id,
       'QC-' || to_char(NOW(), 'YYYYMMDD') || '-' || LPAD(ROW_NUMBER() OVER (ORDER BY rr.created_at)::text, 4, '0'),
       'PENDING',
       now()
FROM receiving_records rr
WHERE NOT EXISTS (SELECT 1 FROM qc_inspections qi WHERE qi.receiving_id = rr.id);

-- ============================================================
-- 4. Every new goods receipt opens its inspection
--
-- create_receiving_from_po() already wrote receiving_items with
-- qc_status = 'PENDING' but left no qc_inspections row behind, so the QC screen
-- had nothing to act on. Wrapped here so the QC queue fills itself.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_receiving_from_po(p_po_id uuid, p_received_date date, p_items jsonb, p_created_by uuid)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rr_id uuid;
  v_rr_number text;
  v_seq int;
  v_item jsonb;
  v_supplier_id uuid;
  v_org_id uuid;
  v_total int;
  v_complete int;
  v_started int;
  v_status text;
  v_qc_id uuid;
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
    COALESCE(p_received_date, CURRENT_DATE), p_created_by, now()
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

  -- Roll the received quantities into the PO lines.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE(v_item->>'po_item_id', '') <> ''
       AND COALESCE((v_item->>'actual_quantity')::numeric, 0) > 0 THEN
      UPDATE purchase_order_items
      SET received_quantity = COALESCE(received_quantity, 0) + (v_item->>'actual_quantity')::numeric,
          updated_at = now()
      WHERE id = (v_item->>'po_item_id')::uuid;
    END IF;
  END LOOP;

  -- Advance the PO status from what was actually received.
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE(received_quantity, 0) >= quantity),
    COUNT(*) FILTER (WHERE COALESCE(received_quantity, 0) > 0)
  INTO v_total, v_complete, v_started
  FROM purchase_order_items
  WHERE po_id = p_po_id;

  IF v_total > 0 AND v_complete = v_total THEN
    v_status := 'RECEIVED';
  ELSIF v_started > 0 THEN
    v_status := 'PARTIALLY_RECEIVED';
  END IF;

  IF v_status IS NOT NULL THEN
    UPDATE purchase_orders
    SET status = v_status, updated_at = now()
    WHERE id = p_po_id;
  END IF;

  INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_data)
  VALUES (v_org_id, p_created_by, 'RECEIVING_CREATED', 'receiving_record', v_rr_id,
    jsonb_build_object(
      'receiving_number', v_rr_number,
      'po_id', p_po_id::text,
      'po_status', v_status
    ));

  -- Open the quality inspection so accepted goods have a path into stock.
  v_qc_id := public.create_qc_inspection_from_receiving(v_rr_id, p_created_by);

  RETURN QUERY SELECT v_rr_id, 'SUCCESS: GR ' || v_rr_number || ' created'::text;
END;
$function$;
