CREATE OR REPLACE FUNCTION public.decide_approval_request(
  p_approval_request_id uuid,
  p_action text,
  p_comment text,
  p_actor_user_id uuid
)
RETURNS public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_request public.approval_requests%ROWTYPE;
  v_step_id uuid;
  v_director_role_id uuid;
  v_request_status text;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Approval actor does not match the authenticated user';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('APPROVE', 'REJECT', 'REQUEST_REVISION') THEN
    RAISE EXCEPTION 'Unsupported approval action: %', p_action;
  END IF;

  SELECT * INTO v_request
  FROM public.approval_requests
  WHERE id = p_approval_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Approval request is not pending';
  END IF;
  IF NOT public.is_org_director(p_actor_user_id, v_request.organization_id) THEN
    RAISE EXCEPTION 'Only an organization director may decide this request';
  END IF;
  IF p_action <> 'APPROVE' AND NULLIF(trim(p_comment), '') IS NULL THEN
    RAISE EXCEPTION 'A comment is required when rejecting or requesting revision';
  END IF;

  SELECT id INTO v_step_id
  FROM public.approval_steps
  WHERE approval_request_id = p_approval_request_id
    AND status = 'PENDING'
    AND (assigned_user_id IS NULL OR assigned_user_id = p_actor_user_id)
  ORDER BY step_number
  LIMIT 1
  FOR UPDATE;

  IF v_step_id IS NULL THEN
    SELECT id INTO v_director_role_id FROM public.roles WHERE code = 'DIRECTOR' LIMIT 1;
    INSERT INTO public.approval_steps (
      approval_request_id, step_number, approver_role_id, assigned_user_id, status
    ) VALUES (
      p_approval_request_id,
      COALESCE((SELECT MAX(step_number) + 1 FROM public.approval_steps WHERE approval_request_id = p_approval_request_id), 1),
      v_director_role_id,
      p_actor_user_id,
      'PENDING'
    ) RETURNING id INTO v_step_id;
  END IF;

  UPDATE public.approval_steps
  SET status = CASE p_action
        WHEN 'APPROVE' THEN 'APPROVED'
        WHEN 'REJECT' THEN 'REJECTED'
        ELSE 'REVISION'
      END,
      acted_at = now()
  WHERE id = v_step_id;

  INSERT INTO public.approval_actions (
    approval_request_id, approval_step_id, acted_by, action, comment
  ) VALUES (
    p_approval_request_id, v_step_id, p_actor_user_id, p_action, NULLIF(trim(p_comment), '')
  );

  IF p_action = 'REJECT' THEN
    v_request_status := 'REJECTED';
  ELSIF p_action = 'REQUEST_REVISION' THEN
    v_request_status := 'REVISION';
  ELSIF EXISTS (
    SELECT 1 FROM public.approval_steps
    WHERE approval_request_id = p_approval_request_id AND status = 'PENDING'
  ) THEN
    v_request_status := 'PENDING';
  ELSE
    v_request_status := 'APPROVED';
  END IF;

  UPDATE public.approval_requests
  SET status = v_request_status,
      completed_at = CASE WHEN v_request_status = 'PENDING' THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_approval_request_id
  RETURNING * INTO v_request;

  IF v_request_status <> 'PENDING' THEN
    IF lower(v_request.entity_type) IN ('stock_adjustment', 'adjustment') THEN
      UPDATE public.stock_adjustments
      SET status = CASE p_action
            WHEN 'APPROVE' THEN 'APPROVED'
            WHEN 'REJECT' THEN 'REJECTED'
            ELSE 'DRAFT'
          END,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN p_actor_user_id ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;
      IF p_action = 'APPROVE' THEN
        PERFORM public.apply_stock_adjustment(v_request.entity_id, p_actor_user_id);
      END IF;
    ELSIF lower(v_request.entity_type) = 'inventory_return' THEN
      UPDATE public.inventory_returns
      SET status = CASE p_action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'DRAFT' END,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN p_actor_user_id ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;
      IF p_action = 'APPROVE' THEN
        PERFORM public.apply_inventory_return(v_request.entity_id, p_actor_user_id);
      END IF;
    ELSIF lower(v_request.entity_type) IN ('stock_transfer', 'transfer') THEN
      UPDATE public.stock_transfers
      SET status = CASE p_action
            WHEN 'APPROVE' THEN 'APPROVED'
            WHEN 'REJECT' THEN 'REJECTED'
            ELSE 'PENDING'
          END,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN p_actor_user_id ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;
    ELSIF lower(v_request.entity_type) IN ('stock_opname', 'opname') THEN
      UPDATE public.stock_opnames
      SET status = CASE p_action
            WHEN 'APPROVE' THEN 'APPROVED'
            WHEN 'REJECT' THEN 'REJECTED'
            ELSE 'IN_PROGRESS'
          END,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN p_actor_user_id ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;
      IF p_action = 'APPROVE' THEN
        PERFORM public.apply_stock_opname(v_request.entity_id, p_actor_user_id);
      END IF;
    ELSIF lower(v_request.entity_type) IN ('rental_contract', 'contract') THEN
      UPDATE public.rental_contracts
      SET status = CASE p_action
            WHEN 'APPROVE' THEN 'APPROVED'
            WHEN 'REJECT' THEN 'CANCELLED'
            ELSE 'DRAFT'
          END,
          approved_by = CASE WHEN p_action = 'APPROVE' THEN p_actor_user_id ELSE approved_by END,
          approved_at = CASE WHEN p_action = 'APPROVE' THEN now() ELSE approved_at END,
          updated_at = now()
      WHERE id = v_request.entity_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_request.organization_id, p_actor_user_id, 'APPROVAL_' || p_action,
    v_request.entity_type, v_request.entity_id,
    jsonb_build_object('approval_request_id', p_approval_request_id, 'status', v_request_status, 'comment', p_comment)
  );

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_approval_request(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decide_approval_request(uuid, text, text, uuid) TO authenticated;