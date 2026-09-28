CREATE OR REPLACE FUNCTION public.issue_inventory_fefo(
  p_organization_id uuid,
  p_product_id uuid,
  p_required_quantity numeric,
  p_owner_type text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reference_number text DEFAULT NULL,
  p_performed_by uuid DEFAULT auth.uid()
RETURNS TABLE (
  success boolean,
  message text,
  total_issued numeric,
  movements_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inventory record;
  v_available numeric;
  v_remaining numeric := p_required_quantity;
  v_issue_quantity numeric;
  v_issue_quantity_kg numeric;
  v_total_issued numeric := 0;
  v_movement_id uuid;
  v_movement_number text;
  v_movements jsonb := '[]'::jsonb;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Picking actor does not match the authenticated user';
  END IF;
  IF p_required_quantity IS NULL OR p_required_quantity <= 0 THEN
    RAISE EXCEPTION 'Requested quantity must be positive';
  END IF;
  IF NOT public.has_org_permission(p_organization_id, 'inventory.manage') THEN
    RAISE EXCEPTION 'Missing inventory.manage permission';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_product_id::text, 0)
  );

  SELECT COALESCE(SUM(i.quantity), 0) INTO v_available
  FROM public.inventory i
  JOIN public.batches b ON b.id = i.batch_id
  WHERE i.organization_id = p_organization_id
    AND i.product_id = p_product_id
    AND i.status = 'AVAILABLE'
    AND b.status = 'ACTIVE'
    AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)
    AND (p_owner_type IS NULL OR i.owner_type = p_owner_type)
    AND (p_owner_id IS NULL OR i.owner_id = p_owner_id);

  IF v_available < p_required_quantity THEN
    RAISE EXCEPTION 'Insufficient eligible FEFO stock: available=%, requested=%',
      v_available, p_required_quantity;
  END IF;

  FOR v_inventory IN
    SELECT i.id, i.batch_id, i.quantity, i.quantity_kg, i.unit_id,
      i.warehouse_id, i.cold_storage_id, i.storage_location_id,
      i.owner_type, i.owner_id, b.expiry_date
    FROM public.inventory i
    JOIN public.batches b ON b.id = i.batch_id
    WHERE i.organization_id = p_organization_id
      AND i.product_id = p_product_id
      AND i.status = 'AVAILABLE'
      AND b.status = 'ACTIVE'
      AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)
      AND (p_owner_type IS NULL OR i.owner_type = p_owner_type)
      AND (p_owner_id IS NULL OR i.owner_id = p_owner_id)
    ORDER BY b.expiry_date ASC NULLS LAST, i.received_at ASC NULLS LAST, i.id ASC
    FOR UPDATE OF i
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_issue_quantity := LEAST(v_remaining, v_inventory.quantity);
    v_issue_quantity_kg := CASE
      WHEN v_inventory.quantity > 0 AND v_inventory.quantity_kg IS NOT NULL
        THEN v_issue_quantity * v_inventory.quantity_kg / v_inventory.quantity
      ELSE v_issue_quantity
    END;
    v_movement_number := public.generate_movement_number(p_organization_id, 'ISSUE');

    INSERT INTO public.inventory_movements (
      organization_id, movement_number, movement_type, inventory_id,
      batch_id, product_id, source_warehouse_id, source_cold_storage_id,
      source_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
      reason, notes, reference_number, performed_by
    ) VALUES (
      p_organization_id, v_movement_number, 'ISSUE', v_inventory.id,
      v_inventory.batch_id, p_product_id, v_inventory.warehouse_id,
      v_inventory.cold_storage_id, v_inventory.storage_location_id,
      v_inventory.owner_type, v_inventory.owner_id, v_issue_quantity,
      v_inventory.unit_id, v_issue_quantity_kg, p_reason, p_notes,
      p_reference_number, p_performed_by
    ) RETURNING id INTO v_movement_id;

    UPDATE public.inventory
    SET quantity = GREATEST(quantity - v_issue_quantity, 0),
        quantity_kg = GREATEST(COALESCE(quantity_kg, 0) - v_issue_quantity_kg, 0),
        status = CASE WHEN quantity - v_issue_quantity <= 0 THEN 'BLOCKED' ELSE status END,
        updated_at = now()
    WHERE id = v_inventory.id;

    v_total_issued := v_total_issued + v_issue_quantity;
    v_remaining := v_remaining - v_issue_quantity;
    v_movements := v_movements || jsonb_build_array(jsonb_build_object(
      'inventory_id', v_inventory.id,
      'movement_id', v_movement_id,
      'quantity', v_issue_quantity,
      'batch_id', v_inventory.batch_id,
      'expiry_date', v_inventory.expiry_date
    ));
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Eligible stock changed during picking; transaction rolled back';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'FEFO_PICK', 'inventory',
    jsonb_build_object(
      'product_id', p_product_id,
      'requested_quantity', p_required_quantity,
      'issued_quantity', v_total_issued,
      'reference_number', p_reference_number,
      'movements', v_movements
    )
  );

  RETURN QUERY SELECT true, 'FEFO picking completed', v_total_issued, v_movements;
END;
$$;