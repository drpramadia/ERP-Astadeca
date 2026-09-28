CREATE OR REPLACE FUNCTION public.transfer_inventory(
  p_organization_id uuid,
  p_source_inventory_id uuid,
  p_destination_location_id uuid,
  p_quantity numeric,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT auth.uid()
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
  v_source public.inventory%ROWTYPE;
  v_destination public.storage_locations%ROWTYPE;
  v_destination_storage public.cold_storages%ROWTYPE;
  v_destination_inventory public.inventory%ROWTYPE;
  v_destination_inventory_id uuid;
  v_transfer_reference uuid := gen_random_uuid();
  v_movement_out uuid;
  v_movement_in uuid;
  v_movement_number_out text;
  v_movement_number_in text;
  v_quantity_kg numeric;
  v_location_occupied numeric;
  v_storage_occupied numeric;
  v_actor_profile uuid;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Transfer actor does not match the authenticated user';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Transfer quantity must be positive';
  END IF;
  IF NOT public.has_org_permission(p_organization_id, 'inventory.transfer') THEN
    RAISE EXCEPTION 'Missing inventory.transfer permission';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_source_inventory_id::text, 0)
  );

  SELECT * INTO v_source
  FROM public.inventory
  WHERE id = p_source_inventory_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source inventory not found in organization';
  END IF;
  IF v_source.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'Only AVAILABLE inventory can be transferred';
  END IF;
  IF v_source.quantity < p_quantity THEN
    RAISE EXCEPTION 'Insufficient source stock: available=%, requested=%', v_source.quantity, p_quantity;
  END IF;

  SELECT * INTO v_destination
  FROM public.storage_locations
  WHERE id = p_destination_location_id AND organization_id = p_organization_id AND active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destination location is not active or belongs to another organization';
  END IF;
  IF v_source.storage_location_id = v_destination.id THEN
    RAISE EXCEPTION 'Source and destination locations are identical';
  END IF;

  SELECT * INTO v_destination_storage
  FROM public.cold_storages
  WHERE id = v_destination.cold_storage_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_destination_storage.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Destination cold storage is not active';
  END IF;

  v_quantity_kg := CASE
    WHEN v_source.quantity > 0 AND v_source.quantity_kg IS NOT NULL
      THEN p_quantity * v_source.quantity_kg / v_source.quantity
    ELSE p_quantity
  END;

  SELECT COALESCE(SUM(quantity_kg), 0) INTO v_location_occupied
  FROM public.inventory
  WHERE storage_location_id = v_destination.id
    AND status IN ('AVAILABLE', 'QUARANTINE');
  IF v_location_occupied + v_quantity_kg > v_destination.capacity_kg THEN
    RAISE EXCEPTION 'Destination location capacity exceeded: available=%, requested=%',
      v_destination.capacity_kg - v_location_occupied, v_quantity_kg;
  END IF;

  IF v_destination.cold_storage_id <> v_source.cold_storage_id THEN
    SELECT COALESCE(SUM(quantity_kg), 0) INTO v_storage_occupied
    FROM public.inventory
    WHERE cold_storage_id = v_destination.cold_storage_id
      AND status IN ('AVAILABLE', 'QUARANTINE');
    IF v_storage_occupied + v_quantity_kg > v_destination_storage.capacity_kg THEN
      RAISE EXCEPTION 'Destination cold storage capacity exceeded: available=%, requested=%',
        v_destination_storage.capacity_kg - v_storage_occupied, v_quantity_kg;
    END IF;
  END IF;

  SELECT id INTO v_actor_profile FROM public.profiles WHERE id = p_performed_by;
  IF v_actor_profile IS NULL THEN
    RAISE EXCEPTION 'Authenticated actor profile is missing';
  END IF;

  SELECT * INTO v_destination_inventory
  FROM public.inventory
  WHERE organization_id = p_organization_id
    AND storage_location_id = v_destination.id
    AND batch_id = v_source.batch_id
    AND owner_type = v_source.owner_type
    AND owner_id = v_source.owner_id
    AND status = 'AVAILABLE'
  LIMIT 1
  FOR UPDATE;
  v_destination_inventory_id := v_destination_inventory.id;

  v_movement_number_out := public.generate_movement_number(p_organization_id, 'TRANSFER_OUT');

  INSERT INTO public.inventory_movements (
    organization_id, movement_number, movement_type, transfer_reference_id,
    inventory_id, batch_id, product_id, source_warehouse_id, source_cold_storage_id,
    source_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
    notes, performed_by
  ) VALUES (
    p_organization_id, v_movement_number_out, 'TRANSFER_OUT', v_transfer_reference,
    v_source.id, v_source.batch_id, v_source.product_id, v_source.warehouse_id,
    v_source.cold_storage_id, v_source.storage_location_id, v_source.owner_type,
    v_source.owner_id, p_quantity, v_source.unit_id, v_quantity_kg, p_notes, p_performed_by
  ) RETURNING id INTO v_movement_out;

  v_movement_number_in := public.generate_movement_number(p_organization_id, 'TRANSFER_IN');

  INSERT INTO public.inventory_movements (
    organization_id, movement_number, movement_type, transfer_reference_id,
    inventory_id, batch_id, product_id, destination_warehouse_id, destination_cold_storage_id,
    destination_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
    notes, performed_by
  ) VALUES (
    p_organization_id, v_movement_number_in, 'TRANSFER_IN', v_transfer_reference,
    v_destination_inventory_id, v_source.batch_id, v_source.product_id,
    v_destination_storage.warehouse_id, v_destination.cold_storage_id, v_destination.id,
    v_source.owner_type, v_source.owner_id, p_quantity, v_source.unit_id,
    v_quantity_kg, p_notes, p_performed_by
  ) RETURNING id INTO v_movement_in;

  UPDATE public.inventory
  SET quantity = quantity - p_quantity,
      quantity_kg = GREATEST(COALESCE(quantity_kg, 0) - v_quantity_kg, 0),
      status = CASE WHEN quantity - p_quantity <= 0 THEN 'BLOCKED' ELSE status END,
      updated_at = now()
  WHERE id = v_source.id;

  IF v_destination_inventory_id IS NULL THEN
    INSERT INTO public.inventory (
      organization_id, warehouse_id, cold_storage_id, storage_location_id,
      product_id, batch_id, owner_type, owner_id, quantity, unit_id,
      quantity_kg, status, received_at, notes
    ) VALUES (
      p_organization_id, v_destination_storage.warehouse_id, v_destination.cold_storage_id,
      v_destination.id, v_source.product_id, v_source.batch_id, v_source.owner_type,
      v_source.owner_id, p_quantity, v_source.unit_id, v_quantity_kg, 'AVAILABLE', now(), p_notes
    ) RETURNING id INTO v_destination_inventory_id;
  ELSE
    UPDATE public.inventory
    SET quantity = quantity + p_quantity,
        quantity_kg = COALESCE(quantity_kg, 0) + v_quantity_kg,
        updated_at = now()
    WHERE id = v_destination_inventory_id;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'INVENTORY_TRANSFER', 'inventory_transfer',
    v_transfer_reference,
    jsonb_build_object(
      'source_inventory_id', v_source.id,
      'destination_inventory_id', v_destination_inventory_id,
      'source_location_id', v_source.storage_location_id,
      'destination_location_id', v_destination.id,
      'quantity', p_quantity,
      'quantity_kg', v_quantity_kg,
      'transfer_out_movement_id', v_movement_out,
      'transfer_in_movement_id', v_movement_in
    )
  );

  RETURN QUERY SELECT true, 'Transfer completed', v_transfer_reference;
END;
$$;