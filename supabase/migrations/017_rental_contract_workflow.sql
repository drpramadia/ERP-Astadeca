CREATE OR REPLACE FUNCTION public.create_rental_contract(
  p_organization_id uuid,
  p_customer_id uuid,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_billing_frequency text,
  p_payment_terms_days integer,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_contract_id uuid;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Contract actor does not match the authenticated user';
  END IF;
  IF NOT public.has_org_permission(p_organization_id, 'rental.manage') THEN
    RAISE EXCEPTION 'Missing rental.manage permission';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer_id AND organization_id = p_organization_id
      AND active = true AND is_rental_customer = true
  ) THEN
    RAISE EXCEPTION 'Active rental customer not found';
  END IF;
  IF NULLIF(trim(p_title), '') IS NULL OR p_start_date IS NULL
     OR (p_end_date IS NOT NULL AND p_end_date < p_start_date) THEN
    RAISE EXCEPTION 'Contract title and valid date range are required';
  END IF;
  IF p_billing_frequency NOT IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY')
     OR p_payment_terms_days < 0 THEN
    RAISE EXCEPTION 'Invalid billing frequency or payment terms';
  END IF;

  INSERT INTO public.rental_contracts (
    organization_id, contract_number, customer_id, title, status,
    start_date, end_date, billing_frequency, payment_terms_days, notes, created_by
  ) VALUES (
    p_organization_id, public.generate_contract_number(p_organization_id), p_customer_id,
    trim(p_title), 'DRAFT', p_start_date, p_end_date, p_billing_frequency,
    p_payment_terms_days, p_notes, p_performed_by
  ) RETURNING id INTO v_contract_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'RENTAL_CONTRACT_CREATED',
    'rental_contract', v_contract_id,
    jsonb_build_object('customer_id', p_customer_id, 'title', p_title)
  );
  RETURN v_contract_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_rental_contract_draft(
  p_contract_id uuid,
  p_customer_id uuid,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_billing_frequency text,
  p_payment_terms_days integer,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_contract public.rental_contracts%ROWTYPE;
  v_old jsonb;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Contract actor does not match the authenticated user';
  END IF;
  SELECT * INTO v_contract FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND OR v_contract.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft rental contracts can be edited';
  END IF;
  IF NOT public.has_org_permission(v_contract.organization_id, 'rental.manage') THEN
    RAISE EXCEPTION 'Missing rental.manage permission';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer_id AND organization_id = v_contract.organization_id
      AND active = true AND is_rental_customer = true
  ) THEN
    RAISE EXCEPTION 'Active rental customer not found';
  END IF;
  IF NULLIF(trim(p_title), '') IS NULL OR p_start_date IS NULL
     OR (p_end_date IS NOT NULL AND p_end_date < p_start_date) THEN
    RAISE EXCEPTION 'Contract title and valid date range are required';
  END IF;
  IF p_billing_frequency NOT IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY')
     OR p_payment_terms_days < 0 THEN
    RAISE EXCEPTION 'Invalid billing frequency or payment terms';
  END IF;

  v_old := jsonb_build_object(
    'customer_id', v_contract.customer_id, 'title', v_contract.title,
    'start_date', v_contract.start_date, 'end_date', v_contract.end_date,
    'billing_frequency', v_contract.billing_frequency, 'payment_terms_days', v_contract.payment_terms_days
  );
  UPDATE public.rental_contracts
  SET customer_id = p_customer_id, title = trim(p_title), start_date = p_start_date,
      end_date = p_end_date, billing_frequency = p_billing_frequency,
      payment_terms_days = p_payment_terms_days, notes = p_notes, updated_at = now()
  WHERE id = p_contract_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    v_contract.organization_id, p_performed_by, 'RENTAL_CONTRACT_UPDATED',
    'rental_contract', p_contract_id, v_old,
    jsonb_build_object('customer_id', p_customer_id, 'title', p_title,
      'start_date', p_start_date, 'end_date', p_end_date,
      'billing_frequency', p_billing_frequency, 'payment_terms_days', p_payment_terms_days)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_rental_contract(
  p_contract_id uuid,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_contract public.rental_contracts%ROWTYPE;
  v_approval_id uuid;
  v_director_role_id uuid;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Contract actor does not match the authenticated user';
  END IF;
  SELECT * INTO v_contract FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND OR v_contract.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft contracts can be submitted';
  END IF;
  IF NOT public.has_org_permission(v_contract.organization_id, 'rental.manage') THEN
    RAISE EXCEPTION 'Missing rental.manage permission';
  END IF;

  INSERT INTO public.approval_requests (
    organization_id, entity_type, entity_id, requested_by, status, title, description
  ) VALUES (
    v_contract.organization_id, 'RENTAL_CONTRACT', p_contract_id,
    p_performed_by, 'PENDING', 'Rental contract ' || v_contract.contract_number,
    'Rental contract requires Director approval before activation.'
  ) RETURNING id INTO v_approval_id;
  SELECT id INTO v_director_role_id FROM public.roles WHERE code = 'DIRECTOR' LIMIT 1;
  INSERT INTO public.approval_steps (
    approval_request_id, step_number, approver_role_id, status
  ) VALUES (v_approval_id, 1, v_director_role_id, 'PENDING');
  UPDATE public.rental_contracts
  SET status = 'PENDING_APPROVAL', approval_request_id = v_approval_id, updated_at = now()
  WHERE id = p_contract_id;
  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_contract.organization_id, p_performed_by, 'RENTAL_CONTRACT_SUBMITTED',
    'rental_contract', p_contract_id, jsonb_build_object('approval_request_id', v_approval_id)
  );
  RETURN v_approval_id;
END;
$$;