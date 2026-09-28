-- Migration: 028_adapter_rpc.sql
-- Adapter RPCs that match the signatures expected by the UI pages
-- UI pages call: create_po_draft(org_id, supplier_id, order_date, expected_date, items_json, notes, created_by)
-- Original migration created: create_po_draft(org_id, supplier_id, items_json, notes, created_by) -- order/expected in items
-- Solution: create matching adapter functions
-- Date: 2026-09-27

CREATE OR REPLACE FUNCTION public.create_po_draft(
  p_org_id uuid,
  p_supplier_id uuid,
  p_order_date date,
  p_expected_date date,
  p_items jsonb,
  p_notes text,
  p_created_by uuid
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_po_id uuid;
  v_po_number text;
  v_seq int;
  v_item jsonb;
BEGIN
  SELECT nextval('document_number_seq') INTO v_seq;
  v_po_number := 'PO-' || to_char(NOW(), 'YYYY') || '-' || LPAD(v_seq::text, 6, '0');

  INSERT INTO purchase_orders (
    organization_id, po_number, supplier_id, status, order_date, expected_date,
    notes, created_by, created_at, updated_at
  ) VALUES (
    p_org_id, v_po_number, p_supplier_id, 'DRAFT',
    COALESCE(p_order_date, CURRENT_DATE),
    p_expected_date,
    p_notes, p_created_by, now(), now()
  ) RETURNING id INTO v_po_id;

  -- Insert items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO purchase_order_items (
      po_id, product_id, quantity, unit_id, unit_price, notes, created_at, updated_at
    ) VALUES (
      v_po_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_id')::uuid,
      (v_item->>'unit_price')::numeric,
      v_item->>'notes',
      now(), now()
    );
  END LOOP;

  -- Audit
  INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_data)
  VALUES (p_org_id, p_created_by, 'PO_DRAFT_CREATED', 'purchase_order', v_po_id,
    jsonb_build_object('po_number', v_po_number, 'supplier_id', p_supplier_id::text));

  RETURN QUERY SELECT v_po_id, 'SUCCESS: PO ' || v_po_number || ' created'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_pr_draft(
  p_org_id uuid,
  p_supplier_id uuid,
  p_request_date date,
  p_needed_date date,
  p_items jsonb,
  p_notes text,
  p_requester_id uuid
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_pr_id uuid;
  v_pr_number text;
  v_seq int;
  v_item jsonb;
BEGIN
  SELECT nextval('document_number_seq') INTO v_seq;
  v_pr_number := 'PR-' || to_char(NOW(), 'YYYY') || '-' || LPAD(v_seq::text, 6, '0');

  INSERT INTO purchase_requests (
    organization_id, pr_number, supplier_id, requester_id, status,
    request_date, needed_date, notes, created_by, created_at, updated_at
  ) VALUES (
    p_org_id, v_pr_number, p_supplier_id, p_requester_id, 'DRAFT',
    COALESCE(p_request_date, CURRENT_DATE), p_needed_date,
    p_notes, p_requester_id, now(), now()
  ) RETURNING id INTO v_pr_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO purchase_request_items (
      pr_id, product_id, quantity, unit_id, requested_price, notes, created_at, updated_at
    ) VALUES (
      v_pr_id,
      (v_item->>'product_id')::uuid,
      COALESCE((v_item->>'quantity')::numeric, 0),
      (v_item->>'unit_id')::uuid,
      (v_item->>'requested_price')::numeric,
      v_item->>'notes',
      now(), now()
    );
  END LOOP;

  INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_data)
  VALUES (p_org_id, p_requester_id, 'PR_DRAFT_CREATED', 'purchase_request', v_pr_id,
    jsonb_build_object('pr_number', v_pr_number));

  RETURN QUERY SELECT v_pr_id, 'SUCCESS: PR ' || v_pr_number || ' created'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_so_draft(
  p_org_id uuid,
  p_customer_id uuid,
  p_order_date date,
  p_delivery_date date,
  p_items jsonb,
  p_notes text,
  p_created_by uuid
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_so_id uuid;
  v_so_number text;
  v_seq int;
  v_item jsonb;
  v_total numeric := 0;
BEGIN
  SELECT nextval('document_number_seq') INTO v_seq;
  v_so_number := 'SO-' || to_char(NOW(), 'YYYY') || '-' || LPAD(v_seq::text, 6, '0');

  INSERT INTO sales_orders (
    organization_id, so_number, customer_id, status,
    order_date, delivery_date, notes, created_by, created_at, updated_at
  ) VALUES (
    p_org_id, v_so_number, p_customer_id, 'DRAFT',
    COALESCE(p_order_date, CURRENT_DATE), p_delivery_date,
    p_notes, p_created_by, now(), now()
  ) RETURNING id INTO v_so_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sales_order_items (
      so_id, product_id, quantity, unit_id, unit_price, subtotal, created_at
    ) VALUES (
      v_so_id,
      (v_item->>'product_id')::uuid,
      COALESCE((v_item->>'quantity')::numeric, 0),
      (v_item->>'unit_id')::uuid,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unit_price')::numeric, 0),
      now()
    );
    v_total := v_total + COALESCE((v_item->>'quantity')::numeric, 0) * COALESCE((v_item->>'unit_price')::numeric, 0);
  END LOOP;

  UPDATE sales_orders SET subtotal = v_total, total_amount = v_total WHERE id = v_so_id;

  INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_data)
  VALUES (p_org_id, p_created_by, 'SO_DRAFT_CREATED', 'sales_order', v_so_id,
    jsonb_build_object('so_number', v_so_number));

  RETURN QUERY SELECT v_so_id, 'SUCCESS: SO ' || v_so_number || ' created'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_receiving_from_po(
  p_po_id uuid,
  p_received_date date,
  p_items jsonb,
  p_created_by uuid
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_rr_id uuid;
  v_rr_number text;
  v_seq int;
  v_item jsonb;
  v_supplier_id uuid;
  v_org_id uuid;
BEGIN
  SELECT supplier_id, organization_id INTO v_supplier_id, v_org_id FROM purchase_orders WHERE id = p_po_id;
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
      receiving_id, product_id, batch_number, quantity, actual_quantity,
      cold_storage_id, storage_location_id, production_date, expiry_date,
      qc_status, created_at
    ) VALUES (
      v_rr_id,
      (v_item->>'product_id')::uuid,
      v_item->>'batch_number',
      COALESCE((v_item->>'quantity')::numeric, 0),
      COALESCE((v_item->>'actual_quantity')::numeric, 0),
      (v_item->>'cold_storage_id')::uuid,
      (v_item->>'storage_location_id')::uuid,
      (v_item->>'production_date')::date,
      (v_item->>'expiry_date')::date,
      COALESCE(v_item->>'qc_status', 'PENDING'),
      now()
    );
  END LOOP;

  INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_data)
  VALUES (v_org_id, p_created_by, 'RECEIVING_CREATED', 'receiving_record', v_rr_id,
    jsonb_build_object('receiving_number', v_rr_number, 'po_id', p_po_id::text));

  RETURN QUERY SELECT v_rr_id, 'SUCCESS: GR ' || v_rr_number || ' created'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_delivery_from_so(
  p_so_id uuid,
  p_delivery_date date,
  p_items jsonb,
  p_driver_name text,
  p_vehicle_number text,
  p_created_by uuid
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_do_id uuid;
  v_do_number text;
  v_seq int;
  v_item jsonb;
  v_org_id uuid;
  v_customer_id uuid;
BEGIN
  SELECT organization_id, customer_id INTO v_org_id, v_customer_id FROM sales_orders WHERE id = p_so_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_so_id, 'ERROR: SO not found'::text;
    RETURN;
  END IF;

  SELECT nextval('document_number_seq') INTO v_seq;
  v_do_number := 'DO-' || to_char(NOW(), 'YYYY') || '-' || LPAD(v_seq::text, 6, '0');

  INSERT INTO delivery_orders (
    organization_id, do_number, sales_order_id, customer_id, status,
    delivery_date, driver_name, vehicle_number,
    created_by, created_at
  ) VALUES (
    v_org_id, v_do_number, p_so_id, v_customer_id, 'DRAFT',
    p_delivery_date, p_driver_name, p_vehicle_number,
    p_created_by, now()
  ) RETURNING id INTO v_do_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO delivery_order_items (
      delivery_id, product_id, batch_number, quantity_ordered
    ) VALUES (
      v_do_id,
      (v_item->>'product_id')::uuid,
      COALESCE(v_item->>'batch_number', ''),
      COALESCE((v_item->>'quantity')::numeric, 0)
    );
  END LOOP;

  INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_data)
  VALUES (v_org_id, p_created_by, 'DO_CREATED', 'delivery_order', v_do_id,
    jsonb_build_object('do_number', v_do_number));

  RETURN QUERY SELECT v_do_id, 'SUCCESS: DO ' || v_do_number || ' created'::text;
END;
$$;
