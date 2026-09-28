-- Migration: 024_rental_contract_storage.sql
-- Description: Add cold storage and capacity fields to rental_contracts
-- Date: 2026-09-27

-- Add cold_storage_id to rental_contracts
ALTER TABLE "public"."rental_contracts" 
ADD COLUMN IF NOT EXISTS "cold_storage_id" uuid;

-- Add total_capacity_kg to rental_contracts
ALTER TABLE "public"."rental_contracts" 
ADD COLUMN IF NOT EXISTS "total_capacity_kg" numeric(14,3);

-- Add foreign key constraint
ALTER TABLE "public"."rental_contracts" 
ADD CONSTRAINT "rental_contracts_cs_fk" 
FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages"("id") ON DELETE RESTRICT;

-- Add RLS policy for cold_storage_id
DROP POLICY IF EXISTS "rental_contracts_cold_storage_read" ON "public"."rental_contracts";
CREATE POLICY "rental_contracts_cold_storage_read" ON "public"."rental_contracts"
  FOR SELECT USING ("public"."is_org_member"("organization_id"));

DROP POLICY IF EXISTS "rental_contracts_cold_storage_update" ON "public"."rental_contracts";
CREATE POLICY "rental_contracts_cold_storage_update" ON "public"."rental_contracts"
  FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'rental.manage'))
  WITH CHECK ("public"."has_org_permission"("organization_id", 'rental.manage'));

-- ============================================
-- Update create_rental_contract function to include cold_storage_id
-- ============================================
CREATE OR REPLACE FUNCTION public.create_rental_contract(
  p_organization_id uuid,
  p_customer_id uuid,
  p_cold_storage_id uuid,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_total_capacity_kg numeric,
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
  -- Validate cold storage belongs to org
  IF p_cold_storage_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cold_storages
      WHERE id = p_cold_storage_id AND organization_id = p_organization_id
        AND status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Active cold storage not found';
    END IF;
  END IF;
  IF NULLIF(trim(p_title), '') IS NULL OR p_start_date IS NULL
     OR (p_end_date IS NOT NULL AND p_end_date < p_start_date) THEN
    RAISE EXCEPTION 'Contract title and valid date range are required';
  END IF;
  IF p_billing_frequency NOT IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY')
     OR p_payment_terms_days < 0 THEN
    RAISE EXCEPTION 'Invalid billing frequency or payment terms';
  END IF;
  IF p_total_capacity_kg IS NOT NULL AND p_total_capacity_kg <= 0 THEN
    RAISE EXCEPTION 'Total capacity must be positive';
  END IF;

  INSERT INTO public.rental_contracts (
    organization_id, contract_number, customer_id, cold_storage_id, title, status,
    start_date, end_date, total_capacity_kg, billing_frequency, payment_terms_days, notes, created_by
  ) VALUES (
    p_organization_id, public.generate_contract_number(p_organization_id), p_customer_id,
    p_cold_storage_id, trim(p_title), 'DRAFT', p_start_date, p_end_date, p_total_capacity_kg,
    p_billing_frequency, p_payment_terms_days, p_notes, p_performed_by
  ) RETURNING id INTO v_contract_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'RENTAL_CONTRACT_CREATED',
    'rental_contract', v_contract_id,
    jsonb_build_object('customer_id', p_customer_id, 'cold_storage_id', p_cold_storage_id, 'title', p_title)
  );
  RETURN v_contract_id;
END;
$$;

-- ============================================
-- Update update_rental_contract_draft function to include cold_storage_id
-- ============================================
CREATE OR REPLACE FUNCTION public.update_rental_contract_draft(
  p_contract_id uuid,
  p_customer_id uuid,
  p_cold_storage_id uuid,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_total_capacity_kg numeric,
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
  -- Validate cold storage belongs to org
  IF p_cold_storage_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.cold_storages
      WHERE id = p_cold_storage_id AND organization_id = v_contract.organization_id
        AND status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Active cold storage not found';
    END IF;
  END IF;
  IF NULLIF(trim(p_title), '') IS NULL OR p_start_date IS NULL
     OR (p_end_date IS NOT NULL AND p_end_date < p_start_date) THEN
    RAISE EXCEPTION 'Contract title and valid date range are required';
  END IF;
  IF p_billing_frequency NOT IN ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY')
     OR p_payment_terms_days < 0 THEN
    RAISE EXCEPTION 'Invalid billing frequency or payment terms';
  END IF;
  IF p_total_capacity_kg IS NOT NULL AND p_total_capacity_kg <= 0 THEN
    RAISE EXCEPTION 'Total capacity must be positive';
  END IF;

  v_old := jsonb_build_object(
    'customer_id', v_contract.customer_id, 'cold_storage_id', v_contract.cold_storage_id,
    'title', v_contract.title, 'start_date', v_contract.start_date, 'end_date', v_contract.end_date,
    'total_capacity_kg', v_contract.total_capacity_kg,
    'billing_frequency', v_contract.billing_frequency, 'payment_terms_days', v_contract.payment_terms_days
  );
  UPDATE public.rental_contracts
  SET customer_id = p_customer_id, cold_storage_id = p_cold_storage_id, title = trim(p_title), 
      start_date = p_start_date, end_date = p_end_date, total_capacity_kg = p_total_capacity_kg,
      billing_frequency = p_billing_frequency, payment_terms_days = p_payment_terms_days, 
      notes = p_notes, updated_at = now()
  WHERE id = p_contract_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    v_contract.organization_id, p_performed_by, 'RENTAL_CONTRACT_UPDATED',
    'rental_contract', p_contract_id, v_old,
    jsonb_build_object(
      'customer_id', p_customer_id, 'cold_storage_id', p_cold_storage_id,
      'title', p_title, 'total_capacity_kg', p_total_capacity_kg
    )
  );
END;
$$;

-- ============================================
-- Cancel rental contract function
-- ============================================
CREATE OR REPLACE FUNCTION public.cancel_rental_contract(
  p_contract_id uuid,
  p_reason text DEFAULT NULL,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_contract public.rental_contracts%ROWTYPE;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Contract actor does not match the authenticated user';
  END IF;
  SELECT * INTO v_contract FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;
  IF NOT public.has_org_permission(v_contract.organization_id, 'rental.manage') THEN
    RAISE EXCEPTION 'Missing rental.manage permission';
  END IF;
  IF v_contract.status NOT IN ('DRAFT', 'ACTIVE', 'SUSPENDED') THEN
    RAISE EXCEPTION 'Cannot cancel contract with status: %', v_contract.status;
  END IF;
  -- Check for active allocations
  IF EXISTS (
    SELECT 1 FROM public.rental_allocations
    WHERE contract_id = p_contract_id AND status IN ('ACTIVE', 'PARTIALLY_RELEASED')
  ) THEN
    RAISE EXCEPTION 'Cannot cancel contract with active allocations. Release all items first.';
  END IF;

  UPDATE public.rental_contracts
  SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_contract_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_contract.organization_id, p_performed_by, 'RENTAL_CONTRACT_CANCELLED',
    'rental_contract', p_contract_id,
    jsonb_build_object('reason', p_reason, 'previous_status', v_contract.status)
  );
END;
$$;
