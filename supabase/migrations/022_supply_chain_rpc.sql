-- Migration: 022_supply_chain_rpc.sql
-- Supply Chain RPC functions: PO, PR, SO, GR, DO generation and workflow

-- ============================================================
-- SEQUENCE for document numbers
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS document_number_seq START 1;

-- ============================================================
-- NUMBER GENERATION FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION generate_po_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_seq_val bigint;
BEGIN
  SELECT nextval('document_number_seq') INTO v_seq_val;
  RETURN 'PO-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(v_seq_val::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_pr_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_seq_val bigint;
BEGIN
  SELECT nextval('document_number_seq') INTO v_seq_val;
  RETURN 'PR-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(v_seq_val::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_so_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_seq_val bigint;
BEGIN
  SELECT nextval('document_number_seq') INTO v_seq_val;
  RETURN 'SO-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(v_seq_val::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_gr_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_seq_val bigint;
BEGIN
  SELECT nextval('document_number_seq') INTO v_seq_val;
  RETURN 'GR-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(v_seq_val::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION generate_do_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_seq_val bigint;
BEGIN
  SELECT nextval('document_number_seq') INTO v_seq_val;
  RETURN 'DO-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(v_seq_val::text, 6, '0');
END;
$$;

-- ============================================================
-- CREATE PO DRAFT
-- ============================================================

CREATE OR REPLACE FUNCTION create_po_draft(
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
  v_item jsonb;
BEGIN
  -- Generate PO number
  v_po_number := generate_po_number(p_org_id);

  -- Insert into purchase_orders
  INSERT INTO purchase_orders (org_id, po_number, supplier_id, order_date, expected_date, notes, status, created_by, created_at, updated_at)
  VALUES (p_org_id, v_po_number, p_supplier_id, p_order_date, p_expected_date, p_notes, 'DRAFT', p_created_by, now(), now())
  RETURNING id INTO v_po_id;

  -- Insert PO items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO po_items (po_id, product_id, quantity, unit_id, unit_price, notes, created_at, updated_at)
    VALUES (
      v_po_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_id')::uuid,
      (v_item->>'unit_price')::numeric,
      v_item->>'notes',
      now(),
      now()
    );
  END LOOP;

  RETURN QUERY SELECT v_po_id, v_po_number::text;
END;
$$;

-- ============================================================
-- CREATE PR DRAFT
-- ============================================================

CREATE OR REPLACE FUNCTION create_pr_draft(
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
  v_item jsonb;
BEGIN
  v_pr_number := generate_pr_number(p_org_id);

  INSERT INTO purchase_requests (org_id, pr_number, supplier_id, request_date, needed_date, notes, status, requester_id, created_by, created_at, updated_at)
  VALUES (p_org_id, v_pr_number, p_supplier_id, p_request_date, p_needed_date, p_notes, 'DRAFT', p_requester_id, p_requester_id, now(), now())
  RETURNING id INTO v_pr_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO pr_items (pr_id, product_id, quantity, unit_id, notes, created_at, updated_at)
    VALUES (
      v_pr_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_id')::uuid,
      v_item->>'notes',
      now(),
      now()
    );
  END LOOP;

  RETURN QUERY SELECT v_pr_id, v_pr_number::text;
END;
$$;

-- ============================================================
-- CREATE SO DRAFT
-- ============================================================

CREATE OR REPLACE FUNCTION create_so_draft(
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
  v_item jsonb;
BEGIN
  v_so_number := generate_so_number(p_org_id);

  INSERT INTO sales_orders (org_id, so_number, customer_id, order_date, delivery_date, notes, status, created_by, created_at, updated_at)
  VALUES (p_org_id, v_so_number, p_customer_id, p_order_date, p_delivery_date, p_notes, 'DRAFT', p_created_by, now(), now())
  RETURNING id INTO v_so_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO so_items (so_id, product_id, quantity, unit_id, unit_price, notes, created_at, updated_at)
    VALUES (
      v_so_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_id')::uuid,
      (v_item->>'unit_price')::numeric,
      v_item->>'notes',
      now(),
      now()
    );
  END LOOP;

  RETURN QUERY SELECT v_so_id, v_so_number::text;
END;
$$;

-- ============================================================
-- SUBMIT PO
-- ============================================================

CREATE OR REPLACE FUNCTION submit_po(p_po_id uuid, p_submitted_by uuid)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE purchase_orders
  SET status = 'SUBMITTED', updated_at = now(), submitted_at = now()
  WHERE id = p_po_id AND status = 'DRAFT';

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_po_id, 'ERROR: PO not found or not in DRAFT status'::text;
    RETURN;
  END IF;

  INSERT INTO approval_requests (doc_type, doc_id, org_id, status, requested_by, requested_at, created_at, updated_at)
  VALUES ('PO', p_po_id, (SELECT org_id FROM purchase_orders WHERE id = p_po_id), 'PENDING', p_submitted_by, now(), now(), now());

  RETURN QUERY SELECT p_po_id, 'PO submitted successfully'::text;
END;
$$;

-- ============================================================
-- APPROVE PO
-- ============================================================

CREATE OR REPLACE FUNCTION approve_po(p_po_id uuid, p_approved_by uuid)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE purchase_orders
  SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(), updated_at = now()
  WHERE id = p_po_id AND status = 'SUBMITTED';

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_po_id, 'ERROR: PO not found or not in SUBMITTED status'::text;
    RETURN;
  END IF;

  UPDATE approval_requests
  SET status = 'APPROVED', decided_by = p_approved_by, decided_at = now(), updated_at = now()
  WHERE doc_type = 'PO' AND doc_id = p_po_id AND status = 'PENDING';

  RETURN QUERY SELECT p_po_id, 'PO approved successfully'::text;
END;
$$;

-- ============================================================
-- CANCEL PO
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_po(p_po_id uuid, p_cancelled_by uuid, p_reason text)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE purchase_orders
  SET status = 'CANCELLED', cancelled_by = p_cancelled_by, cancelled_at = now(), cancelled_reason = p_reason, updated_at = now()
  WHERE id = p_po_id AND status NOT IN ('CANCELLED', 'CLOSED', 'RECEIVED');

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_po_id, 'ERROR: PO not found or cannot be cancelled'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT p_po_id, 'PO cancelled successfully'::text;
END;
$$;

-- ============================================================
-- CREATE RECEIVING FROM PO
-- ============================================================

CREATE OR REPLACE FUNCTION create_receiving_from_po(
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
  v_gr_id uuid;
  v_gr_number text;
  v_org_id uuid;
  v_item jsonb;
  v_po_item_id uuid;
BEGIN
  v_org_id := (SELECT org_id FROM purchase_orders WHERE id = p_po_id);
  v_gr_number := generate_gr_number(v_org_id);

  INSERT INTO receiving_records (org_id, po_id, gr_number, received_date, status, created_by, created_at, updated_at)
  VALUES (v_org_id, p_po_id, v_gr_number, p_received_date, 'RECEIVED', p_created_by, now(), now())
  RETURNING id INTO v_gr_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO receiving_items (receiving_id, po_item_id, product_id, actual_quantity, unit_id, notes, created_at, updated_at)
    VALUES (
      v_gr_id,
      (v_item->>'po_item_id')::uuid,
      (v_item->>'product_id')::uuid,
      (v_item->>'actual_quantity')::numeric,
      (v_item->>'unit_id')::uuid,
      v_item->>'notes',
      now(),
      now()
    );

    -- Update received_quantity on po_items
    UPDATE po_items
    SET received_quantity = COALESCE(received_quantity, 0) + (v_item->>'actual_quantity')::numeric,
        updated_at = now()
    WHERE id = (v_item->>'po_item_id')::uuid;
  END LOOP;

  RETURN QUERY SELECT v_gr_id, v_gr_number::text;
END;
$$;

-- ============================================================
-- CREATE DELIVERY FROM SO
-- ============================================================

CREATE OR REPLACE FUNCTION create_delivery_from_so(
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
  v_org_id uuid;
  v_item jsonb;
BEGIN
  v_org_id := (SELECT org_id FROM sales_orders WHERE id = p_so_id);
  v_do_number := generate_do_number(v_org_id);

  INSERT INTO delivery_orders (org_id, so_id, do_number, delivery_date, driver_name, vehicle_number, status, created_by, created_at, updated_at)
  VALUES (v_org_id, p_so_id, v_do_number, p_delivery_date, p_driver_name, p_vehicle_number, 'DELIVERED', p_created_by, now(), now())
  RETURNING id INTO v_do_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO delivery_items (delivery_id, so_item_id, product_id, quantity, unit_id, notes, created_at, updated_at)
    VALUES (
      v_do_id,
      (v_item->>'so_item_id')::uuid,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_id')::uuid,
      v_item->>'notes',
      now(),
      now()
    );
  END LOOP;

  RETURN QUERY SELECT v_do_id, v_do_number::text;
END;
$$;

-- ============================================================
-- SUBMIT SO
-- ============================================================

CREATE OR REPLACE FUNCTION submit_so(p_so_id uuid, p_submitted_by uuid)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE sales_orders
  SET status = 'SUBMITTED', updated_at = now(), submitted_at = now()
  WHERE id = p_so_id AND status = 'DRAFT';

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_so_id, 'ERROR: SO not found or not in DRAFT status'::text;
    RETURN;
  END IF;

  INSERT INTO approval_requests (doc_type, doc_id, org_id, status, requested_by, requested_at, created_at, updated_at)
  VALUES ('SO', p_so_id, (SELECT org_id FROM sales_orders WHERE id = p_so_id), 'PENDING', p_submitted_by, now(), now(), now());

  RETURN QUERY SELECT p_so_id, 'SO submitted successfully'::text;
END;
$$;

-- ============================================================
-- APPROVE SO
-- ============================================================

CREATE OR REPLACE FUNCTION approve_so(p_so_id uuid, p_approved_by uuid)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE sales_orders
  SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(), updated_at = now()
  WHERE id = p_so_id AND status = 'SUBMITTED';

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_so_id, 'ERROR: SO not found or not in SUBMITTED status'::text;
    RETURN;
  END IF;

  UPDATE approval_requests
  SET status = 'APPROVED', decided_by = p_approved_by, decided_at = now(), updated_at = now()
  WHERE doc_type = 'SO' AND doc_id = p_so_id AND status = 'PENDING';

  RETURN QUERY SELECT p_so_id, 'SO approved successfully'::text;
END;
$$;
