CREATE OR REPLACE FUNCTION public.create_stock_adjustment(
  p_organization_id uuid,
  p_inventory_id uuid,
  p_adjusted_quantity numeric,
  p_adjusted_quantity_kg numeric,
  p_reason text,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inventory public.inventory%ROWTYPE;
  v_adjustment_id uuid;
  v_adjustment_type text;
  v_variance numeric;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Adjustment actor does not match the authenticated user';
  END IF;
  IF NOT public.has_org_permission(p_organization_id, 'inventory.adjust') THEN
    RAISE EXCEPTION 'Missing inventory.adjust permission';
  END IF;
  IF p_adjusted_quantity IS NULL OR p_adjusted_quantity < 0
     OR (p_adjusted_quantity_kg IS NOT NULL AND p_adjusted_quantity_kg < 0) THEN
    RAISE EXCEPTION 'Adjusted quantities cannot be negative';
  END IF;
  IF p_reason NOT IN ('COUNT_DIFFERENCE', 'DAMAGE', 'EXPIRY', 'WEIGHT_LOSS', 'SYSTEM_CORRECTION', 'OTHER') THEN
    RAISE EXCEPTION 'Unsupported adjustment reason';
  END IF;

  SELECT * INTO v_inventory
  FROM public.inventory
  WHERE id = p_inventory_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item not found in organization';
  END IF;

  v_variance := p_adjusted_quantity - v_inventory.quantity;
  IF v_variance = 0 AND p_adjusted_quantity_kg IS NOT DISTINCT FROM v_inventory.quantity_kg THEN
    RAISE EXCEPTION 'Adjustment has no quantity difference';
  END IF;
  v_adjustment_type := CASE WHEN v_variance >= 0 THEN 'INCREASE' ELSE 'DECREASE' END;

  INSERT INTO public.stock_adjustments (
    organization_id, adjustment_number, adjustment_type, reason, notes, status, performed_by
  ) VALUES (
    p_organization_id, 'ADJ-' || to_char(now(), 'YYMMDDHH24MISSMS'),
    v_adjustment_type, p_reason, p_notes, 'DRAFT', p_performed_by
  ) RETURNING id INTO v_adjustment_id;

  INSERT INTO public.stock_adjustment_items (
    adjustment_id, inventory_id, batch_id, product_id,
    current_quantity, adjusted_quantity, variance_quantity, unit_id,
    current_quantity_kg, adjusted_quantity_kg, variance_quantity_kg, notes
  ) VALUES (
    v_adjustment_id, v_inventory.id, v_inventory.batch_id, v_inventory.product_id,
    v_inventory.quantity, p_adjusted_quantity, v_variance, v_inventory.unit_id,
    v_inventory.quantity_kg, p_adjusted_quantity_kg,
    CASE WHEN p_adjusted_quantity_kg IS NULL THEN NULL ELSE p_adjusted_quantity_kg - COALESCE(v_inventory.quantity_kg, 0) END,
    p_notes
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'STOCK_ADJUSTMENT_DRAFTED',
    'stock_adjustment', v_adjustment_id,
    jsonb_build_object('inventory_id', v_inventory.id, 'reason', p_reason, 'variance', v_variance)
  );

  RETURN v_adjustment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_stock_adjustment(
  p_adjustment_id uuid,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_adjustment public.stock_adjustments%ROWTYPE;
  v_approval_id uuid;
  v_director_role_id uuid;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Adjustment actor does not match the authenticated user';
  END IF;
  SELECT * INTO v_adjustment FROM public.stock_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock adjustment not found';
  END IF;
  IF NOT public.has_org_permission(v_adjustment.organization_id, 'inventory.adjust') THEN
    RAISE EXCEPTION 'Missing inventory.adjust permission';
  END IF;
  IF v_adjustment.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft adjustments can be submitted';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_adjustment_items WHERE adjustment_id = p_adjustment_id) THEN
    RAISE EXCEPTION 'Adjustment requires at least one item';
  END IF;

  INSERT INTO public.approval_requests (
    organization_id, entity_type, entity_id, requested_by, status, title, description
  ) VALUES (
    v_adjustment.organization_id, 'STOCK_ADJUSTMENT', p_adjustment_id,
    p_performed_by, 'PENDING', 'Stock adjustment ' || v_adjustment.adjustment_number,
    'Inventory quantity change requires Director approval.'
  ) RETURNING id INTO v_approval_id;

  SELECT id INTO v_director_role_id FROM public.roles WHERE code = 'DIRECTOR' LIMIT 1;
  INSERT INTO public.approval_steps (
    approval_request_id, step_number, approver_role_id, status
  ) VALUES (v_approval_id, 1, v_director_role_id, 'PENDING');

  UPDATE public.stock_adjustments
  SET status = 'PENDING_APPROVAL', approval_request_id = v_approval_id, updated_at = now()
  WHERE id = p_adjustment_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_adjustment.organization_id, p_performed_by, 'STOCK_ADJUSTMENT_SUBMITTED',
    'stock_adjustment', p_adjustment_id, jsonb_build_object('approval_request_id', v_approval_id)
  );

  RETURN v_approval_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stock_adjustment(
  p_adjustment_id uuid,
  p_performed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_adjustment public.stock_adjustments%ROWTYPE;
  v_item record;
  v_inventory public.inventory%ROWTYPE;
  v_movement_type text;
  v_movement_number text;
  v_delta numeric;
  v_delta_kg numeric;
BEGIN
  SELECT * INTO v_adjustment FROM public.stock_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF NOT FOUND OR v_adjustment.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Approved stock adjustment is required before applying';
  END IF;
  IF NOT public.is_org_director(p_performed_by, v_adjustment.organization_id) THEN
    RAISE EXCEPTION 'Only a Director may apply an approved adjustment';
  END IF;

  FOR v_item IN
    SELECT * FROM public.stock_adjustment_items WHERE adjustment_id = p_adjustment_id ORDER BY id
  LOOP
    SELECT * INTO v_inventory FROM public.inventory
    WHERE id = v_item.inventory_id AND organization_id = v_adjustment.organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory item % no longer exists', v_item.inventory_id;
    END IF;
    IF v_inventory.quantity <> v_item.current_quantity
       OR v_inventory.quantity_kg IS DISTINCT FROM v_item.current_quantity_kg THEN
      RAISE EXCEPTION 'Inventory changed after adjustment draft for item %', v_item.id;
    END IF;

    v_delta := v_item.adjusted_quantity - v_inventory.quantity;
    v_delta_kg := COALESCE(v_item.adjusted_quantity_kg, v_item.adjusted_quantity)
      - COALESCE(v_inventory.quantity_kg, v_inventory.quantity);
    IF v_delta <> 0 OR v_delta_kg <> 0 THEN
      v_movement_type := CASE
        WHEN v_delta < 0 OR (v_delta = 0 AND v_delta_kg < 0) THEN 'ISSUE'
        ELSE 'ADJUSTMENT'
      END;
      v_movement_number := public.generate_movement_number(v_adjustment.organization_id, v_movement_type);
      INSERT INTO public.inventory_movements (
        organization_id, movement_number, movement_type, inventory_id,
        batch_id, product_id, source_warehouse_id, source_cold_storage_id,
        source_location_id, destination_warehouse_id, destination_cold_storage_id,
        destination_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
        source_entity_type, source_entity_id, reason, notes, performed_by
      ) VALUES (
        v_adjustment.organization_id, v_movement_number, v_movement_type, v_inventory.id,
        v_inventory.batch_id, v_inventory.product_id,
        CASE WHEN v_delta < 0 THEN v_inventory.warehouse_id ELSE NULL END,
        CASE WHEN v_delta < 0 THEN v_inventory.cold_storage_id ELSE NULL END,
        CASE WHEN v_delta < 0 THEN v_inventory.storage_location_id ELSE NULL END,
        CASE WHEN v_delta > 0 THEN v_inventory.warehouse_id ELSE NULL END,
        CASE WHEN v_delta > 0 THEN v_inventory.cold_storage_id ELSE NULL END,
        CASE WHEN v_delta > 0 THEN v_inventory.storage_location_id ELSE NULL END,
        v_inventory.owner_type, v_inventory.owner_id,
        CASE WHEN abs(v_delta) > 0 THEN abs(v_delta) ELSE abs(v_delta_kg) END,
        v_inventory.unit_id,
        abs(v_delta_kg), 'STOCK_ADJUSTMENT', p_adjustment_id, v_adjustment.reason,
        v_adjustment.notes, p_performed_by
      );
    END IF;

    UPDATE public.inventory
    SET quantity = v_item.adjusted_quantity,
        quantity_kg = v_item.adjusted_quantity_kg,
        status = CASE WHEN v_item.adjusted_quantity = 0 THEN 'BLOCKED' ELSE status END,
        updated_at = now()
    WHERE id = v_inventory.id;
  END LOOP;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_adjustment.organization_id, p_performed_by, 'STOCK_ADJUSTMENT_APPLIED',
    'stock_adjustment', p_adjustment_id,
    jsonb_build_object('adjustment_number', v_adjustment.adjustment_number, 'reason', v_adjustment.reason)
  );
END;
$$;