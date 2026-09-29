CREATE OR REPLACE FUNCTION public.receive_rental_stock(p_organization_id uuid, p_contract_id uuid, p_customer_id uuid, p_product_id uuid, p_batch_id uuid, p_cold_storage_id uuid, p_storage_location_id uuid, p_quantity numeric, p_quantity_kg numeric, p_unit_id uuid, p_performed_by uuid, p_reference_number text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(inventory_id uuid, allocation_id uuid, movement_id uuid, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inventory_id uuid;
  v_allocation_id uuid;
  v_movement_id uuid;
  v_movement_number text;
  v_warehouse_id uuid;
  v_contract record;
  v_rate record;
  v_existing_inventory_id uuid;
  v_quantity_kg numeric;
BEGIN
  -- Get warehouse from cold storage
  SELECT warehouse_id INTO v_warehouse_id
  FROM "public"."cold_storages" WHERE id = p_cold_storage_id;
  
  -- Validate contract
  SELECT * INTO v_contract FROM "public"."rental_contracts" WHERE id = p_contract_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;
  
  IF v_contract.status != 'ACTIVE' THEN
    RAISE EXCEPTION 'Contract must be ACTIVE to receive stock, current status: %', v_contract.status;
  END IF;
  
  -- Calculate quantity in KG
  v_quantity_kg := COALESCE(p_quantity_kg, p_quantity);
  
  -- Check cold storage capacity (company + customer combined)
  -- Reuse inventory capacity check
  PERFORM "public"."get_cold_storage_capacity"(p_cold_storage_id, NULL, NULL);
  
  -- Check storage location capacity
  -- Reuse location capacity check
  PERFORM "public"."get_storage_location_capacity"(p_storage_location_id);
  
  -- Get applicable rental rate
  SELECT * INTO v_rate FROM "public"."get_applicable_rental_rate"(
    p_organization_id, p_customer_id, p_product_id, p_cold_storage_id, p_storage_location_id
  ) LIMIT 1;
  
  IF NOT FOUND OR v_rate.rate_id IS NULL THEN
    RAISE EXCEPTION 'No applicable rental rate found for this customer/product/storage';
  END IF;
  
  -- Check if customer-owned inventory exists at this location
  SELECT id INTO v_existing_inventory_id
  FROM "public"."inventory"
  WHERE cold_storage_id = p_cold_storage_id
    AND storage_location_id = p_storage_location_id
    AND batch_id = p_batch_id
    AND owner_type = 'CUSTOMER'
    AND owner_id = p_customer_id
    AND status = 'AVAILABLE'
  LIMIT 1;
  
  IF v_existing_inventory_id IS NOT NULL THEN
    -- Update existing inventory
    UPDATE "public"."inventory"
    SET quantity = quantity + p_quantity,
        quantity_kg = COALESCE(quantity_kg, 0) + v_quantity_kg,
        received_at = COALESCE(received_at, now()),
        updated_at = now()
    WHERE id = v_existing_inventory_id
    RETURNING id INTO v_inventory_id;
  ELSE
    -- Create new customer-owned inventory
    INSERT INTO "public"."inventory" (
      organization_id, warehouse_id, cold_storage_id, storage_location_id,
      product_id, batch_id, owner_type, owner_id, quantity, unit_id,
      quantity_kg, status, received_at
    ) VALUES (
      p_organization_id, v_warehouse_id, p_cold_storage_id, p_storage_location_id,
      p_product_id, p_batch_id, 'CUSTOMER', p_customer_id, p_quantity, p_unit_id,
      v_quantity_kg, 'AVAILABLE', now()
    )
    RETURNING id INTO v_inventory_id;
  END IF;
  
  -- Create rental allocation
  INSERT INTO "public"."rental_allocations" (
    organization_id, allocation_number, contract_id, customer_id,
    inventory_id, batch_id, product_id, warehouse_id, cold_storage_id, storage_location_id,
    allocated_quantity, allocated_quantity_kg, active_quantity_kg, status
  ) VALUES (
    p_organization_id, "public"."generate_allocation_number"(p_organization_id),
    p_contract_id, p_customer_id, v_inventory_id, p_batch_id, p_product_id,
    v_warehouse_id, p_cold_storage_id, p_storage_location_id,
    p_quantity, v_quantity_kg, v_quantity_kg, 'ACTIVE'
  )
  RETURNING id INTO v_allocation_id;
  
  -- Create quantity snapshot for billing
  INSERT INTO "public"."rental_quantity_snapshots" (
    allocation_id, snapshot_date, quantity_kg, reason, reference_id, reference_type
  ) VALUES (
    v_allocation_id, CURRENT_DATE, v_quantity_kg, 'RECEIVE', v_inventory_id, 'INVENTORY'
  );
  
  -- Generate movement number
  v_movement_number := "public"."generate_rental_movement_number"(p_organization_id, 'RECEIVE');
  
  -- Create rental movement
  INSERT INTO "public"."rental_stock_movements" (
    organization_id, movement_number, movement_type, allocation_id,
    contract_id, customer_id, inventory_id, batch_id, product_id,
    destination_warehouse_id, destination_cold_storage_id, destination_location_id,
    quantity, quantity_kg, rate_id, rate_per_kg_day,
    reference_number, notes, performed_by
  ) VALUES (
    p_organization_id, v_movement_number, 'RECEIVE', v_allocation_id,
    p_contract_id, p_customer_id, v_inventory_id, p_batch_id, p_product_id,
    v_warehouse_id, p_cold_storage_id, p_storage_location_id,
    p_quantity, v_quantity_kg, v_rate.rate_id, v_rate.rate_per_kg_day,
    p_reference_number, p_notes, p_performed_by
  )
  RETURNING id INTO v_movement_id;
  
  -- Audit log
  INSERT INTO "public"."audit_logs" (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'RENTAL_RECEIVE', 'rental_allocation', v_allocation_id,
    jsonb_build_object(
      'contract_id', p_contract_id,
      'customer_id', p_customer_id,
      'inventory_id', v_inventory_id,
      'quantity_kg', v_quantity_kg,
      'rate_per_kg_day', v_rate.rate_per_kg_day
    )
  );
  
  RETURN QUERY SELECT v_inventory_id, v_allocation_id, v_movement_id, 'Rental stock received successfully'::text;
END;
$function$
