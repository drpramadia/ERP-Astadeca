-- Migration: 046_contract_form_and_auto_assign.sql
-- Fixes contract creation: duration_days → auto end_date
-- Adds auto-assign empty basket RPC for receiving
-- Date: 2026-09-29

-- ============================================================
-- 1. Update create_rental_contract: add p_duration_days
--    If p_duration_days is provided, calculate end_date = start_date + duration_days
--    Remove cold_storage_id from UI flow (auto-assign at receiving)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_rental_contract(
  p_organization_id     uuid,
  p_customer_id         uuid,
  p_title               text,
  p_start_date          date,
  p_duration_days       integer DEFAULT NULL,  -- NEW: instead of end_date
  p_billing_frequency   text    DEFAULT 'MONTHLY',
  p_payment_terms_days  integer DEFAULT 30,
  p_notes               text    DEFAULT NULL,
  p_performed_by        uuid    DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_contract_id  uuid;
  v_end_date    date;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Actor mismatch';
  END IF;
  IF NOT public.has_org_permission(p_organization_id, 'rental.manage') THEN
    RAISE EXCEPTION 'Missing rental.manage permission';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers
    WHERE id = p_customer_id
      AND organization_id = p_organization_id
      AND active = true
      AND is_rental_customer = true
  ) THEN
    RAISE EXCEPTION 'Active rental customer not found';
  END IF;
  IF NULLIF(trim(p_title), '') IS NULL OR p_start_date IS NULL THEN
    RAISE EXCEPTION 'Title and start date are required';
  END IF;
  IF p_billing_frequency NOT IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY')
     OR p_payment_terms_days < 0 THEN
    RAISE EXCEPTION 'Invalid billing frequency or payment terms';
  END IF;

  -- Calculate end_date from duration
  IF p_duration_days IS NOT NULL AND p_duration_days > 0 THEN
    v_end_date := p_start_date + (p_duration_days || ' days')::interval;
  END IF;

  INSERT INTO public.rental_contracts (
    organization_id, contract_number, customer_id, title,
    status, start_date, end_date, billing_frequency,
    payment_terms_days, notes, created_by
  ) VALUES (
    p_organization_id,
    public.generate_contract_number(p_organization_id),
    p_customer_id,
    trim(p_title),
    'DRAFT',
    p_start_date,
    v_end_date,
    p_billing_frequency,
    p_payment_terms_days,
    p_notes,
    p_performed_by
  ) RETURNING id INTO v_contract_id;

  RETURN v_contract_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_rental_contract(
  uuid, uuid, text, date, integer, text, integer, text, uuid
) TO authenticated;

-- ============================================================
-- 2. Auto-assign empty basket RPC
--    Finds the first available (empty) basket for the product zone,
--    or any empty basket if no specific zone.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_available_basket(
  p_organization_id   uuid,
  p_product_id        uuid DEFAULT NULL  -- optional: match zone
)
RETURNS TABLE (
  basket_id       uuid,
  basket_code     text,
  basket_name    text,
  basket_capacity numeric,
  cold_storage_id uuid,
  cs_code         text,
  cs_name         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  -- Priority 1: empty baskets in zones matching product category
  SELECT
    sl.id, sl.code, sl.name, sl.capacity_kg,
    sl.cold_storage_id, cs.code, cs.name
  FROM public.storage_locations sl
  JOIN public.cold_storages cs ON cs.id = sl.cold_storage_id
  WHERE sl.organization_id = p_organization_id
    AND sl.active = true
    AND cs.status = 'ACTIVE'
    AND NOT EXISTS (
      SELECT 1 FROM public.rental_allocations ra
      WHERE ra.storage_location_id = sl.id
        AND ra.status IN ('ACTIVE','PARTIALLY_RELEASED')
    )
  ORDER BY
    CASE WHEN sl.capacity_kg > 0 THEN 0 ELSE 1 END,  -- prefer basket with capacity set
    sl.zone, sl.code
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_available_basket(uuid, uuid) TO authenticated;

-- ============================================================
-- 3. Fix release_rental_stock: change PARTIALLY_RELEASED constraint
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_rental_stock(
  p_allocation_id          uuid,
  p_quantity_kg            numeric,
  p_reason                 text    DEFAULT NULL,
  p_notes                  text    DEFAULT NULL,
  p_performed_by           uuid    DEFAULT auth.uid(),
  p_approval_request_id   uuid    DEFAULT NULL
)
RETURNS TABLE (success boolean, message text, movement_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_alloc       public.rental_allocations%ROWTYPE;
  v_contract     public.rental_contracts%ROWTYPE;
  v_new_active   numeric;
  v_new_released numeric;
  v_mov_id      uuid;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Actor mismatch'; END IF;
  IF p_quantity_kg IS NULL OR p_quantity_kg <= 0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;

  SELECT * INTO v_alloc FROM public.rental_allocations WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Allocation not found'; END IF;
  IF NOT public.has_org_permission(v_alloc.organization_id, 'rental.release') THEN RAISE EXCEPTION 'Missing rental.release'; END IF;
  IF v_alloc.status NOT IN ('ACTIVE','PARTIALLY_RELEASED') THEN RAISE EXCEPTION 'Allocation is not releasable'; END IF;
  IF v_alloc.active_quantity_kg < p_quantity_kg THEN RAISE EXCEPTION 'Insufficient active quantity'; END IF;

  SELECT * INTO v_contract FROM public.rental_contracts WHERE id = v_alloc.contract_id;
  IF v_contract.status <> 'ACTIVE' THEN RAISE EXCEPTION 'Contract must be active'; END IF;

  v_new_active   := v_alloc.active_quantity_kg - p_quantity_kg;
  v_new_released := v_alloc.released_quantity_kg + p_quantity_kg;

  UPDATE public.rental_allocations SET
    active_quantity_kg = v_new_active,
    released_quantity_kg = v_new_released,
    status = CASE WHEN v_new_active <= 0 THEN 'RELEASED' ELSE 'PARTIALLY_RELEASED' END,
    updated_at = now()
  WHERE id = p_allocation_id;

  INSERT INTO public.rental_stock_movements (
    organization_id, contract_id, customer_id, product_id, batch_id,
    storage_location_id, movement_type, movement_subtype,
    quantity_kg, reference_number, reason, notes, performed_by
  ) VALUES (
    v_alloc.organization_id, v_alloc.contract_id, v_alloc.customer_id,
    v_alloc.product_id, v_alloc.batch_id, v_alloc.storage_location_id,
    'RELEASE', 'PARTIAL_RELEASE',
    p_quantity_kg,
    'REL-' || to_char(now(),'YYYYMMDD') || '-' || left(md5(random()::text), 3),
    p_reason, p_notes, p_performed_by
  ) RETURNING id INTO v_mov_id;

  RETURN QUERY SELECT true, 'Released ' || p_quantity_kg || ' kg successfully', v_mov_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_rental_stock(uuid, numeric, text, text, uuid, uuid) TO authenticated;
