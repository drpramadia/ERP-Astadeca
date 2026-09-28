CREATE OR REPLACE FUNCTION public.release_rental_stock(
  p_allocation_id uuid,
  p_quantity_kg numeric,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT auth.uid(),
  p_approval_request_id uuid DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text,
  movement_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_allocation public.rental_allocations%ROWTYPE;
  v_inventory public.inventory%ROWTYPE;
  v_contract public.rental_contracts%ROWTYPE;
  v_new_active_kg numeric;
  v_new_released_kg numeric;
  v_quantity_to_release numeric;
  v_movement_id uuid;
  v_movement_number text;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Release actor does not match the authenticated user';
  END IF;
  IF p_quantity_kg IS NULL OR p_quantity_kg <= 0 THEN
    RAISE EXCEPTION 'Release quantity must be positive';
  END IF;

  SELECT * INTO v_allocation
  FROM public.rental_allocations
  WHERE id = p_allocation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation not found';
  END IF;
  IF NOT public.has_org_permission(v_allocation.organization_id, 'rental.release') THEN
    RAISE EXCEPTION 'Missing rental.release permission';
  END IF;
  IF v_allocation.status NOT IN ('ACTIVE', 'PARTIALLY_RELEASED') THEN
    RAISE EXCEPTION 'Allocation is not releasable';
  END IF;
  IF v_allocation.active_quantity_kg < p_quantity_kg THEN
    RAISE EXCEPTION 'Insufficient active quantity: available=%, requested=%',
      v_allocation.active_quantity_kg, p_quantity_kg;
  END IF;

  SELECT * INTO v_contract
  FROM public.rental_contracts
  WHERE id = v_allocation.contract_id;
  IF v_contract.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Rental contract must be active';
  END IF;
  IF p_quantity_kg > (v_allocation.active_quantity_kg * 0.2) THEN
    PERFORM public.require_approved_request(
      v_allocation.organization_id,
      p_approval_request_id,
      'Exceptional rental release'
    );
  END IF;

  SELECT * INTO v_inventory
  FROM public.inventory
  WHERE id = v_allocation.inventory_id
  FOR UPDATE;
  IF NOT FOUND OR v_inventory.owner_type <> 'CUSTOMER'
     OR v_inventory.owner_id <> v_allocation.customer_id
     OR COALESCE(v_inventory.quantity_kg, 0) < p_quantity_kg THEN
    RAISE EXCEPTION 'Customer-owned inventory is inconsistent with the allocation';
  END IF;

  v_new_active_kg := v_allocation.active_quantity_kg - p_quantity_kg;
  v_new_released_kg := v_allocation.released_quantity_kg + p_quantity_kg;
  v_quantity_to_release := p_quantity_kg * v_allocation.allocated_quantity
    / NULLIF(v_allocation.allocated_quantity_kg, 0);

  UPDATE public.rental_allocations
  SET active_quantity_kg = v_new_active_kg,
      released_quantity_kg = v_new_released_kg,
      status = CASE WHEN v_new_active_kg = 0 THEN 'RELEASED' ELSE 'PARTIALLY_RELEASED' END,
      released_at = CASE WHEN v_new_active_kg = 0 THEN now() ELSE released_at END,
      updated_at = now()
  WHERE id = p_allocation_id;

  UPDATE public.inventory
  SET quantity = GREATEST(quantity - v_quantity_to_release, 0),
      quantity_kg = GREATEST(COALESCE(quantity_kg, 0) - p_quantity_kg, 0),
      status = CASE WHEN quantity_kg - p_quantity_kg <= 0 THEN 'BLOCKED' ELSE status END,
      updated_at = now()
  WHERE id = v_allocation.inventory_id;

  v_movement_number := public.generate_rental_movement_number(
    v_allocation.organization_id, 'RELEASE'
  );
  INSERT INTO public.rental_stock_movements (
    organization_id, movement_number, movement_type, allocation_id,
    contract_id, customer_id, inventory_id, batch_id, product_id,
    source_warehouse_id, source_cold_storage_id, source_location_id,
    quantity, quantity_kg, reason, notes, performed_by
  ) VALUES (
    v_allocation.organization_id, v_movement_number, 'RELEASE', p_allocation_id,
    v_allocation.contract_id, v_allocation.customer_id, v_allocation.inventory_id,
    v_allocation.batch_id, v_allocation.product_id, v_allocation.warehouse_id,
    v_allocation.cold_storage_id, v_allocation.storage_location_id,
    v_quantity_to_release, p_quantity_kg, p_reason, p_notes, p_performed_by
  ) RETURNING id INTO v_movement_id;

  INSERT INTO public.rental_quantity_snapshots (
    allocation_id, snapshot_date, quantity_kg, reason, reference_id, reference_type, notes
  ) VALUES (
    p_allocation_id, CURRENT_DATE, v_new_active_kg, 'RELEASE', v_movement_id, 'MOVEMENT', p_notes
  )
  ON CONFLICT (allocation_id, snapshot_date) DO UPDATE
  SET quantity_kg = EXCLUDED.quantity_kg,
      reason = EXCLUDED.reason,
      reference_id = EXCLUDED.reference_id,
      reference_type = EXCLUDED.reference_type,
      notes = EXCLUDED.notes;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_allocation.organization_id, p_performed_by, 'RENTAL_RELEASE',
    'rental_allocation', p_allocation_id,
    jsonb_build_object(
      'quantity_kg', p_quantity_kg,
      'remaining_active_kg', v_new_active_kg,
      'movement_id', v_movement_id,
      'reason', p_reason
    )
  );

  RETURN QUERY SELECT true,
    'Release successful. Remaining quantity: ' || v_new_active_kg,
    v_movement_id;
END;
$$;