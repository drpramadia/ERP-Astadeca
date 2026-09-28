-- Migration: 031_fix_decide_approval_request.sql
-- Repair the approval decision RPC so the Approve/Reject/Revision buttons work.
--
-- Root cause: migration 027_approval_workflow.sql declared
--   decide_approval_request(p_approval_request_id, p_action, p_comment, p_actor_user_id)
-- but its body referenced the undeclared `p_comments`, and wrote to the columns
-- `approval_requests.decided_by / decided_at / comments`, none of which exist.
-- The version actually deployed then drifted to the signature
-- (uuid, text, uuid, text) with names p_decided_by/p_comments, so the frontend call
--   rpc("decide_approval_request", { p_approval_request_id, p_action, p_comment, p_actor_user_id })
-- resolved to no function at all: every approval action failed.
--
-- This migration drops both broken overloads and installs one correct definition
-- whose parameter names match the frontend call sites.
-- Date: 2026-09-28

-- Drop every known broken overload (different arg types => separate functions).
DROP FUNCTION IF EXISTS public.decide_approval_request(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.decide_approval_request(uuid, text, text, uuid);

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
  v_step_id uuid;
  v_director_role_id uuid;
  v_actor uuid;
  v_new_status text;
  v_entity_status text;
  v_note text := NULLIF(trim(COALESCE(p_comment, '')), '');
BEGIN
  v_actor := COALESCE(p_actor_user_id, auth.uid());

  -- ---- Validation ----------------------------------------------------
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Approval actor could not be resolved';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('APPROVE', 'REJECT', 'REQUEST_REVISION') THEN
    RAISE EXCEPTION 'Unsupported approval action: %', p_action;
  END IF;

  SELECT * INTO v_request FROM approval_requests WHERE id = p_approval_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;

  IF v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Approval request is not pending (current status: %)', v_request.status;
  END IF;

  IF NOT public.is_org_director(v_actor, v_request.organization_id) THEN
    RAISE EXCEPTION 'Only an organization director may decide this request';
  END IF;

  IF p_action <> 'APPROVE' AND v_note IS NULL THEN
    RAISE EXCEPTION 'A comment is required when rejecting or requesting revision';
  END IF;

  -- ---- Resolve the approval step -------------------------------------
  SELECT id INTO v_step_id
  FROM approval_steps
  WHERE approval_request_id = p_approval_request_id
    AND status = 'PENDING'
    AND (assigned_user_id IS NULL OR assigned_user_id = v_actor)
  ORDER BY step_number
  LIMIT 1;

  -- Documents submitted without a pre-built step (PO/SO) get one now.
  IF v_step_id IS NULL THEN
    SELECT id INTO v_director_role_id FROM roles WHERE code = 'DIRECTOR' LIMIT 1;
    INSERT INTO approval_steps (
      approval_request_id, step_number, approver_role_id, assigned_user_id, status
    ) VALUES (
      p_approval_request_id,
      COALESCE((SELECT MAX(step_number) + 1 FROM approval_steps WHERE approval_request_id = p_approval_request_id), 1),
      v_director_role_id,
      v_actor,
      'PENDING'
    ) RETURNING id INTO v_step_id;
  END IF;

  UPDATE approval_steps
  SET status = CASE p_action
        WHEN 'APPROVE' THEN 'APPROVED'
        WHEN 'REJECT' THEN 'REJECTED'
        ELSE 'REVISION'
      END,
      acted_at = now()
  WHERE id = v_step_id;

  INSERT INTO approval_actions (
    approval_request_id, approval_step_id, acted_by, action, comment
  ) VALUES (
    p_approval_request_id, v_step_id, v_actor, p_action, v_note
  );

  -- ---- Request-level status ------------------------------------------
  IF p_action = 'REJECT' THEN
    v_new_status := 'REJECTED';
  ELSIF p_action = 'REQUEST_REVISION' THEN
    v_new_status := 'REVISION';
  ELSIF EXISTS (
    SELECT 1 FROM approval_steps
    WHERE approval_request_id = p_approval_request_id AND status = 'PENDING'
  ) THEN
    v_new_status := 'PENDING';
  ELSE
    v_new_status := 'APPROVED';
  END IF;

  UPDATE approval_requests
  SET status = v_new_status,
      completed_at = CASE WHEN v_new_status = 'PENDING' THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_approval_request_id;

  -- ---- Propagate to the originating document --------------------------
  -- Entity-level statuses match each table's CHECK constraint:
  --   REJECTED / APPROVED / DRAFT (revision) are valid for all of them.
  IF v_new_status <> 'PENDING' THEN
    v_entity_status := CASE p_action
      WHEN 'APPROVE' THEN 'APPROVED'
      WHEN 'REJECT' THEN 'REJECTED'
      ELSE 'DRAFT'
    END;

    IF v_request.entity_type IN ('STOCK_ADJUSTMENT', 'ADJUSTMENT') THEN
      UPDATE stock_adjustments
      SET status = v_entity_status,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN v_actor ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;
      IF p_action = 'APPROVE' THEN
        PERFORM public.apply_stock_adjustment(v_request.entity_id, v_actor);
      END IF;

    ELSIF v_request.entity_type = 'STOCK_OPNAME' THEN
      UPDATE stock_opnames
      SET status = v_entity_status,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN v_actor ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;
      IF p_action = 'APPROVE' THEN
        PERFORM public.apply_stock_opname(v_request.entity_id, v_actor);
      END IF;

    ELSIF v_request.entity_type = 'INVENTORY_RETURN' THEN
      UPDATE inventory_returns
      SET status = v_entity_status,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN v_actor ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;
      IF p_action = 'APPROVE' THEN
        PERFORM public.apply_inventory_return(v_request.entity_id, v_actor);
      END IF;

    ELSIF v_request.entity_type = 'RENTAL_CONTRACT' THEN
      -- Approval marks the contract APPROVED. Activation stays with
      -- activate_rental_contract(), which re-checks require_approved_request().
      UPDATE rental_contracts
      SET status = v_entity_status,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN v_actor ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;

    ELSIF v_request.entity_type = 'PO' THEN
      UPDATE purchase_orders
      SET status = v_entity_status,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN v_actor ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;

    ELSIF v_request.entity_type IN ('PR', 'PURCHASE_REQUEST') THEN
      UPDATE purchase_requests
      SET status = v_entity_status,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN v_actor ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;

    ELSIF v_request.entity_type = 'SO' THEN
      UPDATE sales_orders
      SET status = v_entity_status,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN v_actor ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;

    ELSIF v_request.entity_type IN ('RETURN', 'RETURNS') THEN
      UPDATE returns
      SET status = v_entity_status, updated_at = now()
      WHERE id = v_request.entity_id;
    END IF;
  END IF;

  -- ---- Audit + notify the requester ----------------------------------
  INSERT INTO audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_request.organization_id,
    v_actor,
    'APPROVAL_' || p_action,
    'approval_request',
    p_approval_request_id,
    jsonb_build_object(
      'entity_type', v_request.entity_type,
      'entity_id', v_request.entity_id,
      'action', p_action,
      'status', v_new_status,
      'comment', v_note
    )
  );

  PERFORM public.send_notification(
    v_request.organization_id,
    v_request.requested_by,
    v_actor,
    CASE p_action WHEN 'APPROVE' THEN 'SUCCESS' WHEN 'REJECT' THEN 'ERROR' ELSE 'WARNING' END,
    CASE p_action
      WHEN 'APPROVE' THEN 'Pengajuan Disetujui'
      WHEN 'REJECT' THEN 'Pengajuan Ditolak'
      ELSE 'Pengajuan Perlu Revisi'
    END,
    COALESCE(v_request.title, v_request.entity_type) ||
      ' — ' || CASE p_action
        WHEN 'APPROVE' THEN 'telah disetujui.'
        WHEN 'REJECT' THEN 'ditolak. ' || COALESCE(v_note, '')
        ELSE 'perlu direvisi. ' || COALESCE(v_note, '')
      END,
    '/approval',
    'approval_request',
    p_approval_request_id
  );

  RETURN QUERY SELECT p_approval_request_id, 'SUCCESS: ' || v_new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_approval_request(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_approval_request(uuid, text, text, uuid) TO authenticated;
