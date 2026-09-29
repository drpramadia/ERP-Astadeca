-- Migration: 063_update_apply_qc_inspection_signature.sql
--
-- apply_qc_inspection in remote DB still has 5 params (old signature from mig 060
-- before it was patched). Supabase won't re-apply 060 since it's already marked
-- applied. This migration does a CREATE OR REPLACE to add the 2 missing params
-- (p_checklist_data, p_evidence_photos) so the frontend can pass them.
--
-- Date: 2026-09-29

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
  v_org_id    uuid;
  v_receiving uuid;
  v_prev      text;
  v_item      record;
  v_warehouse uuid;
  v_cold      uuid;
  v_is_accepted boolean;
  v_batch     uuid;
  v_batch_no  text;
  v_posted    int := 0;
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

  -- `result` is also an OUT parameter, so qualify it.
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
             ri.production_date, ri.expiry_date
      FROM receiving_items ri
      WHERE ri.receiving_id = v_receiving
        AND COALESCE(ri.actual_quantity, ri.quantity, 0) > 0
        AND ri.product_id IS NOT NULL
      ORDER BY ri.created_at, ri.id
    LOOP
      v_cold := v_item.cold_storage_id;
      IF v_cold IS NULL AND v_item.storage_location_id IS NOT NULL THEN
        SELECT sl.cold_storage_id INTO v_cold
        FROM storage_locations sl WHERE sl.id = v_item.storage_location_id;
      END IF;

      v_warehouse := NULL;
      IF v_cold IS NOT NULL THEN
        SELECT cs.warehouse_id INTO v_warehouse FROM cold_storages cs WHERE cs.id = v_cold;
      END IF;

      IF v_warehouse IS NULL THEN
        SELECT w.id INTO v_warehouse
        FROM warehouses w WHERE w.organization_id = v_org_id
        ORDER BY w.created_at NULLS LAST, w.name LIMIT 1;
      END IF;

      IF v_warehouse IS NULL THEN
        RETURN QUERY SELECT NULL::uuid, 'ERROR: tidak ada gudang tujuan untuk stok ini'::text;
        RETURN;
      END IF;

      v_batch_no := NULLIF(TRIM(COALESCE(v_item.batch_number, '')), '');
      IF v_batch_no IS NOT NULL THEN
        SELECT b.id INTO v_batch FROM batches b
        WHERE b.organization_id = v_org_id AND b.product_id = v_item.product_id
          AND b.batch_number = v_batch_no LIMIT 1;
      END IF;

      IF v_batch IS NULL AND v_batch_no IS NOT NULL THEN
        INSERT INTO batches (organization_id, product_id, batch_number, production_date, expiry_date)
        VALUES (v_org_id, v_item.product_id, v_batch_no, v_item.production_date, v_item.expiry_date)
        RETURNING id INTO v_batch;
      ELSIF v_batch IS NULL THEN
        SELECT b.id INTO v_batch FROM batches b
        WHERE b.organization_id = v_org_id AND b.product_id = v_item.product_id
        ORDER BY b.created_at DESC LIMIT 1;
      END IF;

      INSERT INTO public.inventory (
        organization_id, receiving_id, batch_id, product_id,
        quantity, quantity_kg, unit_id,
        cold_storage_id, storage_location_id,
        owner_type, status, received_at, notes
      ) VALUES (
        v_org_id, v_receiving, v_batch, v_item.product_id,
        v_item.qty, v_item.qty, v_item.unit_id,
        v_item.cold_storage_id, v_item.storage_location_id,
        'COMPANY',
        CASE WHEN p_status = 'PARTIAL_ACCEPT' THEN 'QUARANTINE' ELSE 'AVAILABLE' END,
        now(),
        'Posted from QC ' || p_inspection_id
      )
      ON CONFLICT DO NOTHING;

      v_posted := v_posted + 1;
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    v_org_id,
    COALESCE(p_performed_by, auth.uid()),
    'QC_INSPECTION_APPLIED',
    'qc_inspection',
    p_inspection_id,
    jsonb_build_object('status', v_prev),
    jsonb_build_object(
      'status', p_status,
      'result', p_result,
      'notes', p_notes,
      'checklist_data', p_checklist_data,
      'evidence_photos', p_evidence_photos,
      'inventory_posted_count', v_posted
    )
  );

  RETURN QUERY SELECT p_inspection_id,
    ('OK: status=' || p_status || ', inventory_posted=' || v_posted)::text;
END;
$function$;
