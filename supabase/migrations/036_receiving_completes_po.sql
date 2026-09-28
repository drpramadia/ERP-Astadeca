-- Migration: 036_receiving_completes_po.sql
-- Goods-in could be recorded but never closed the purchase order: the PO stayed
-- APPROVED forever, purchase_order_items.received_quantity stayed NULL, and the
-- purchasing page — which already renders the statuses RECEIVED and
-- PARTIALLY_RECEIVED — never saw either of them.
--
-- create_receiving_from_po() is the single entry point for goods-in and is
-- SECURITY DEFINER, so the receipt bookkeeping belongs in the function rather
-- than in each caller:
--   * add each line's actual_quantity to purchase_order_items.received_quantity
--     when the caller identifies the line (p_items[].po_item_id)
--   * recompute the PO status: RECEIVED when every line is complete,
--     PARTIALLY_RECEIVED once any line has been received at all
--
-- purchase_orders.status is free text (no CHECK constraint) and the UI already
-- knows both values, so no schema change is required.
--
-- Date: 2026-09-28

CREATE OR REPLACE FUNCTION public.create_receiving_from_po(
  p_po_id uuid,
  p_received_date date,
  p_items jsonb,
  p_created_by uuid
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  RETURN QUERY SELECT v_rr_id, 'SUCCESS: GR ' || v_rr_number || ' created'::text;
END;
$function$;
