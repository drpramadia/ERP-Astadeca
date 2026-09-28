CREATE OR REPLACE FUNCTION public.create_stock_opname(
  p_organization_id uuid,
  p_warehouse_id uuid,
  p_cold_storage_id uuid,
  p_planned_date date,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_opname_id uuid;
  v_opname_number text;
  v_item_count integer;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Stock opname actor does not match the authenticated user';
  END IF;
  IF NOT public.has_org_permission(p_organization_id, 'inventory.opname') THEN
    RAISE EXCEPTION 'Missing inventory.opname permission';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id AND organization_id = p_organization_id AND active = true) THEN
    RAISE EXCEPTION 'Warehouse is not active or belongs to another organization';
  END IF;
  IF p_cold_storage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cold_storages
    WHERE id = p_cold_storage_id AND organization_id = p_organization_id
      AND warehouse_id = p_warehouse_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Cold storage is not active or does not belong to the warehouse';
  END IF;

  v_opname_number := 'OPN-' || to_char(now(), 'YYMMDDHH24MISSMS');
  INSERT INTO public.stock_opnames (
    organization_id, warehouse_id, cold_storage_id, opname_number,
    status, planned_date, notes, performed_by
  ) VALUES (
    p_organization_id, p_warehouse_id, p_cold_storage_id, v_opname_number,
    'IN_PROGRESS', p_planned_date, p_notes, p_performed_by
  ) RETURNING id INTO v_opname_id;

  INSERT INTO public.stock_opname_items (
    opname_id, inventory_id, batch_id, product_id, storage_location_id,
    planned_quantity, planned_quantity_kg
  )
  SELECT v_opname_id, inventory.id, inventory.batch_id, inventory.product_id,
    inventory.storage_location_id, inventory.quantity, inventory.quantity_kg
  FROM public.inventory inventory
  WHERE inventory.organization_id = p_organization_id
    AND inventory.warehouse_id = p_warehouse_id
    AND (p_cold_storage_id IS NULL OR inventory.cold_storage_id = p_cold_storage_id)
    AND inventory.status IN ('AVAILABLE', 'QUARANTINE', 'DAMAGED', 'EXPIRED', 'BLOCKED');

  GET DIAGNOSTICS v_item_count = ROW_COUNT;
  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'No inventory found for the selected warehouse and storage';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'STOCK_OPNAME_CREATED',
    'stock_opname', v_opname_id,
    jsonb_build_object('opname_number', v_opname_number, 'item_count', v_item_count)
  );

  RETURN v_opname_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_stock_opname(
  p_opname_id uuid,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_opname public.stock_opnames%ROWTYPE;
  v_approval_id uuid;
  v_director_role_id uuid;
  v_item_count integer;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Stock opname actor does not match the authenticated user';
  END IF;
  SELECT * INTO v_opname FROM public.stock_opnames WHERE id = p_opname_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock opname not found';
  END IF;
  IF NOT public.has_org_permission(v_opname.organization_id, 'inventory.opname') THEN
    RAISE EXCEPTION 'Missing inventory.opname permission';
  END IF;
  IF v_opname.status <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Only an in-progress stock opname can be submitted';
  END IF;

  SELECT count(*) INTO v_item_count FROM public.stock_opname_items
  WHERE opname_id = p_opname_id AND counted_quantity IS NOT NULL;
  IF v_item_count = 0 OR EXISTS (
    SELECT 1 FROM public.stock_opname_items
    WHERE opname_id = p_opname_id AND counted_quantity IS NULL
  ) THEN
    RAISE EXCEPTION 'Every stock opname item must be counted before submission';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.stock_opname_items
    WHERE opname_id = p_opname_id
      AND (counted_quantity < 0 OR (counted_quantity_kg IS NOT NULL AND counted_quantity_kg < 0))
  ) THEN
    RAISE EXCEPTION 'Counted quantities cannot be negative';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.stock_opname_items
    WHERE opname_id = p_opname_id
      AND counted_quantity <> planned_quantity
      AND NULLIF(trim(variance_reason), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'A reason is required for every count difference';
  END IF;

  UPDATE public.stock_opname_items
  SET variance_quantity = counted_quantity - planned_quantity,
      variance_quantity_kg = CASE
        WHEN counted_quantity_kg IS NULL THEN NULL
        ELSE counted_quantity_kg - COALESCE(planned_quantity_kg, planned_quantity)
      END
  WHERE opname_id = p_opname_id;

  INSERT INTO public.approval_requests (
    organization_id, entity_type, entity_id, requested_by, status, title, description
  ) VALUES (
    v_opname.organization_id, 'STOCK_OPNAME', p_opname_id, p_performed_by,
    'PENDING', 'Stock opname ' || v_opname.opname_number,
    'Physical count requires Director approval before inventory adjustment.'
  ) RETURNING id INTO v_approval_id;

  SELECT id INTO v_director_role_id FROM public.roles WHERE code = 'DIRECTOR' LIMIT 1;
  INSERT INTO public.approval_steps (
    approval_request_id, step_number, approver_role_id, status
  ) VALUES (v_approval_id, 1, v_director_role_id, 'PENDING');

  UPDATE public.stock_opnames
  SET status = 'PENDING_APPROVAL', approval_request_id = v_approval_id,
      counted_date = CURRENT_DATE, updated_at = now()
  WHERE id = p_opname_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_opname.organization_id, p_performed_by, 'STOCK_OPNAME_SUBMITTED',
    'stock_opname', p_opname_id,
    jsonb_build_object('approval_request_id', v_approval_id, 'counted_items', v_item_count)
  );
  RETURN v_approval_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stock_opname(
  p_opname_id uuid,
  p_performed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_opname public.stock_opnames%ROWTYPE;
  v_item record;
  v_inventory public.inventory%ROWTYPE;
  v_delta numeric;
  v_delta_kg numeric;
  v_movement_type text;
  v_movement_number text;
BEGIN
  SELECT * INTO v_opname FROM public.stock_opnames WHERE id = p_opname_id FOR UPDATE;
  IF NOT FOUND OR v_opname.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Approved stock opname is required before applying counts';
  END IF;
  IF NOT public.is_org_director(p_performed_by, v_opname.organization_id) THEN
    RAISE EXCEPTION 'Only a Director may apply an approved stock opname';
  END IF;

  FOR v_item IN
    SELECT * FROM public.stock_opname_items
    WHERE opname_id = p_opname_id AND COALESCE(variance_quantity, 0) <> 0
    ORDER BY id
  LOOP
    SELECT * INTO v_inventory FROM public.inventory
    WHERE id = v_item.inventory_id AND organization_id = v_opname.organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Inventory item % no longer exists', v_item.inventory_id;
    END IF;
    IF v_inventory.quantity <> v_item.planned_quantity THEN
      RAISE EXCEPTION 'Inventory changed after count for item %', v_item.id;
    END IF;

    v_delta := v_item.counted_quantity - v_inventory.quantity;
    v_delta_kg := COALESCE(v_item.counted_quantity_kg, v_item.counted_quantity)
      - COALESCE(v_inventory.quantity_kg, v_inventory.quantity);
    v_movement_type := CASE
      WHEN v_delta < 0 OR (v_delta = 0 AND v_delta_kg < 0) THEN 'ISSUE'
      ELSE 'ADJUSTMENT'
    END;
    v_movement_number := public.generate_movement_number(v_opname.organization_id, v_movement_type);

    INSERT INTO public.inventory_movements (
      organization_id, movement_number, movement_type, inventory_id,
      batch_id, product_id, source_warehouse_id, source_cold_storage_id,
      source_location_id, destination_warehouse_id, destination_cold_storage_id,
      destination_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
      source_entity_type, source_entity_id, reason, notes, performed_by
    ) VALUES (
      v_opname.organization_id, v_movement_number, v_movement_type, v_inventory.id,
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
      abs(v_delta_kg), 'STOCK_OPNAME', p_opname_id, 'COUNT_DIFFERENCE',
      v_item.variance_reason, p_performed_by
    );

    UPDATE public.inventory
    SET quantity = v_item.counted_quantity,
        quantity_kg = COALESCE(v_item.counted_quantity_kg, v_item.counted_quantity),
        status = CASE WHEN v_item.counted_quantity = 0 THEN 'BLOCKED' ELSE status END,
        updated_at = now()
    WHERE id = v_inventory.id;
  END LOOP;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_opname.organization_id, p_performed_by, 'STOCK_OPNAME_APPLIED',
    'stock_opname', p_opname_id, jsonb_build_object('opname_number', v_opname.opname_number)
  );
END;
$$;