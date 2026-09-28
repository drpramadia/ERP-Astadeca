-- Migration: 027_approval_workflow.sql
-- Fix approval workflow: universal decide_approval_request function
-- that works with actual approval_requests schema
-- Date: 2026-09-27

-- ============================================================
-- Universal approval decision function
-- Works with actual schema: entity_type, entity_id, organization_id, requested_by
-- ============================================================
CREATE OR REPLACE FUNCTION public.decide_approval_request(
  p_approval_request_id uuid,
  p_action text,
  p_comment text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_request record;
  v_new_status text;
BEGIN
  -- Validate action
  IF p_action NOT IN ('APPROVE', 'REJECT', 'REQUEST_REVISION') THEN
    RETURN QUERY SELECT p_approval_request_id, 'ERROR: Invalid action'::text;
    RETURN;
  END IF;

  -- Get the request
  SELECT * INTO v_request FROM approval_requests WHERE id = p_approval_request_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_approval_request_id, 'ERROR: Approval request not found'::text;
    RETURN;
  END IF;

  IF v_request.status != 'PENDING' THEN
    RETURN QUERY SELECT p_approval_request_id, 'ERROR: Request is not pending'::text;
    RETURN;
  END IF;

  -- Map action to status
  v_new_status := CASE p_action
    WHEN 'APPROVE' THEN 'APPROVED'
    WHEN 'REJECT' THEN 'REJECTED'
    WHEN 'REQUEST_REVISION' THEN 'REVISION_REQUESTED'
    ELSE 'PENDING'
  END;

  -- Update the approval request
  UPDATE approval_requests
  SET status = v_new_status,
      decided_by = p_actor_user_id,
      decided_at = now(),
      comments = p_comments,
      updated_at = now()
  WHERE id = p_approval_request_id;

  -- Create audit log
  INSERT INTO audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_request.organization_id,
    p_actor_user_id,
    'APPROVAL_' || p_action,
    'approval_request',
    p_approval_request_id,
    jsonb_build_object(
      'entity_type', v_request.entity_type,
      'entity_id', v_request.entity_id,
      'action', p_action,
      'comments', p_comments
    )
  );

  -- Apply entity-specific status changes
  IF p_action = 'APPROVE' THEN
    -- Update the actual document status based on entity_type
    IF v_request.entity_type = 'PO' THEN
      UPDATE purchase_orders
      SET status = 'APPROVED', approved_by = p_actor_user_id, approved_at = now(), updated_at = now()
      WHERE id = v_request.entity_id AND status IN ('SUBMITTED', 'PENDING_APPROVAL');
    ELSIF v_request.entity_type = 'PR' THEN
      UPDATE purchase_requests
      SET status = 'APPROVED', approved_by = p_actor_user_id, approved_at = now(), updated_at = now()
      WHERE id = v_request.entity_id AND status IN ('SUBMITTED', 'PENDING_APPROVAL');
    ELSIF v_request.entity_type = 'SO' THEN
      UPDATE sales_orders
      SET status = 'APPROVED', approved_by = p_actor_user_id, approved_at = now(), updated_at = now()
      WHERE id = v_request.entity_id AND status IN ('SUBMITTED', 'PENDING_APPROVAL');
    ELSIF v_request.entity_type = 'RENTAL_CONTRACT' THEN
      UPDATE rental_contracts
      SET status = 'ACTIVE', approved_by = p_actor_user_id, approved_at = now(), updated_at = now()
      WHERE id = v_request.entity_id AND status IN ('PENDING_APPROVAL');
    ELSIF v_request.entity_type = 'STOCK_ADJUSTMENT' THEN
      UPDATE stock_adjustments
      SET status = 'APPROVED', approved_by = p_actor_user_id, approved_at = now(), updated_at = now()
      WHERE id = v_request.entity_id AND status IN ('PENDING_APPROVAL');
    ELSIF v_request.entity_type = 'STOCK_OPNAME' THEN
      UPDATE stock_opnames
      SET status = 'COMPLETED', approved_by = p_actor_user_id, approved_at = now(), updated_at = now()
      WHERE id = v_request.entity_id AND status IN ('PENDING_APPROVAL');
    ELSIF v_request.entity_type = 'RETURN' THEN
      UPDATE returns
      SET status = 'APPROVED', updated_at = now()
      WHERE id = v_request.entity_id AND status = 'PENDING';
    END IF;
  ELSIF p_action = 'REJECT' THEN
    IF v_request.entity_type = 'PO' THEN
      UPDATE purchase_orders SET status = 'REJECTED', updated_at = now()
      WHERE id = v_request.entity_id AND status IN ('SUBMITTED', 'PENDING_APPROVAL');
    ELSIF v_request.entity_type = 'PR' THEN
      UPDATE purchase_requests SET status = 'REJECTED', updated_at = now()
      WHERE id = v_request.entity_id AND status IN ('SUBMITTED', 'PENDING_APPROVAL');
    ELSIF v_request.entity_type = 'SO' THEN
      UPDATE sales_orders SET status = 'REJECTED', updated_at = now()
      WHERE id = v_request.entity_id AND status IN ('SUBMITTED', 'PENDING_APPROVAL');
    ELSIF v_request.entity_type = 'RENTAL_CONTRACT' THEN
      UPDATE rental_contracts SET status = 'REJECTED', updated_at = now()
      WHERE id = v_request.entity_id AND status = 'PENDING_APPROVAL';
    ELSIF v_request.entity_type = 'RETURN' THEN
      UPDATE returns SET status = 'REJECTED', updated_at = now()
      WHERE id = v_request.entity_id AND status = 'PENDING';
    END IF;
  END IF;

  RETURN QUERY SELECT p_approval_request_id, 'SUCCESS: ' || v_new_status;
END;
$$;

-- ============================================================
-- Fix submit_po: use correct column names
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_po(
  p_po_id uuid,
  p_submitted_by uuid DEFAULT auth.uid()
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Get org_id
  SELECT organization_id INTO v_org_id FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_po_id, 'ERROR: PO not found'::text;
    RETURN;
  END IF;

  -- Update PO status
  UPDATE purchase_orders
  SET status = 'SUBMITTED', updated_at = now()
  WHERE id = p_po_id AND status = 'DRAFT';

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_po_id, 'ERROR: PO not in DRAFT status'::text;
    RETURN;
  END IF;

  -- Create approval request with correct column names
  INSERT INTO approval_requests (
    organization_id, entity_type, entity_id,
    requested_by, status, title, description,
    submitted_at, created_at, updated_at
  ) VALUES (
    v_org_id, 'PO', p_po_id,
    p_submitted_by, 'PENDING',
    'Persetujuan Purchase Order',
    'Menunggu persetujuan director untuk Purchase Order',
    now(), now(), now()
  );

  RETURN QUERY SELECT p_po_id, 'SUCCESS: PO submitted for approval'::text;
END;
$$;

-- ============================================================
-- Fix submit_so: use correct column names
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_so(
  p_so_id uuid,
  p_submitted_by uuid DEFAULT auth.uid()
)
RETURNS TABLE(result uuid, msg text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM sales_orders WHERE id = p_so_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_so_id, 'ERROR: SO not found'::text;
    RETURN;
  END IF;

  UPDATE sales_orders
  SET status = 'SUBMITTED', updated_at = now()
  WHERE id = p_so_id AND status = 'DRAFT';

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_so_id, 'ERROR: SO not in DRAFT status'::text;
    RETURN;
  END IF;

  INSERT INTO approval_requests (
    organization_id, entity_type, entity_id,
    requested_by, status, title, description,
    submitted_at, created_at, updated_at
  ) VALUES (
    v_org_id, 'SO', p_so_id,
    p_submitted_by, 'PENDING',
    'Persetujuan Sales Order',
    'Menunggu persetujuan untuk Sales Order',
    now(), now(), now()
  );

  RETURN QUERY SELECT p_so_id, 'SUCCESS: SO submitted for approval'::text;
END;
$$;
