CREATE TABLE IF NOT EXISTS public.inventory_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  return_number text NOT NULL,
  return_type text NOT NULL CHECK (return_type IN ('CUSTOMER_RETURN', 'SUPPLIER_RETURN')),
  counterparty_id uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN ('DAMAGED', 'WRONG_ITEM', 'WRONG_QTY', 'QUALITY', 'EXPIRED', 'OTHER')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')),
  approval_request_id uuid REFERENCES public.approval_requests(id),
  notes text,
  performed_by uuid NOT NULL REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.inventory_returns(id) ON DELETE RESTRICT,
  inventory_id uuid REFERENCES public.inventory(id),
  batch_id uuid NOT NULL REFERENCES public.batches(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  cold_storage_id uuid NOT NULL REFERENCES public.cold_storages(id),
  storage_location_id uuid NOT NULL REFERENCES public.storage_locations(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  quantity_kg numeric(14,3) NOT NULL CHECK (quantity_kg > 0),
  unit_id uuid NOT NULL REFERENCES public.units(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inventory_returns_org_created_idx
  ON public.inventory_returns (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_return_items_return_idx
  ON public.inventory_return_items (return_id);

ALTER TABLE public.inventory_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_returns_select
  ON public.inventory_returns FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY inventory_returns_insert
  ON public.inventory_returns FOR INSERT TO authenticated
  WITH CHECK (public.has_org_permission(organization_id, 'inventory.manage'));
CREATE POLICY inventory_returns_update
  ON public.inventory_returns FOR UPDATE TO authenticated
  USING (public.has_org_permission(organization_id, 'inventory.manage'))
  WITH CHECK (public.has_org_permission(organization_id, 'inventory.manage'));
CREATE POLICY inventory_return_items_select
  ON public.inventory_return_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_returns r
    WHERE r.id = return_id AND public.is_org_member(r.organization_id)
  ));
CREATE POLICY inventory_return_items_insert
  ON public.inventory_return_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_returns r
    WHERE r.id = return_id AND public.has_org_permission(r.organization_id, 'inventory.manage')
  ));

CREATE OR REPLACE FUNCTION public.create_inventory_return(
  p_organization_id uuid,
  p_return_type text,
  p_counterparty_id uuid,
  p_reason text,
  p_inventory_id uuid,
  p_batch_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid,
  p_cold_storage_id uuid,
  p_storage_location_id uuid,
  p_quantity numeric,
  p_quantity_kg numeric,
  p_unit_id uuid,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_return_id uuid;
  v_return_number text;
  v_source public.inventory%ROWTYPE;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Return actor does not match the authenticated user';
  END IF;
  IF NOT public.has_org_permission(p_organization_id, 'inventory.manage') THEN
    RAISE EXCEPTION 'Missing inventory.manage permission';
  END IF;
  IF p_return_type NOT IN ('CUSTOMER_RETURN', 'SUPPLIER_RETURN') THEN
    RAISE EXCEPTION 'Unsupported return type';
  END IF;
  IF p_reason NOT IN ('DAMAGED', 'WRONG_ITEM', 'WRONG_QTY', 'QUALITY', 'EXPIRED', 'OTHER') THEN
    RAISE EXCEPTION 'Unsupported return reason';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity_kg IS NULL OR p_quantity_kg <= 0 THEN
    RAISE EXCEPTION 'Return quantities must be positive';
  END IF;

  IF p_return_type = 'CUSTOMER_RETURN' THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_counterparty_id AND organization_id = p_organization_id AND active = true) THEN
      RAISE EXCEPTION 'Active customer not found';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_counterparty_id AND organization_id = p_organization_id AND active = true) THEN
      RAISE EXCEPTION 'Active supplier not found';
    END IF;
    SELECT * INTO v_source FROM public.inventory
    WHERE id = p_inventory_id AND organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND OR v_source.status <> 'AVAILABLE' THEN
      RAISE EXCEPTION 'Supplier return requires AVAILABLE source inventory';
    END IF;
    IF v_source.quantity < p_quantity OR COALESCE(v_source.quantity_kg, 0) < p_quantity_kg THEN
      RAISE EXCEPTION 'Insufficient source stock for supplier return';
    END IF;
    IF v_source.owner_type <> 'COMPANY' OR v_source.owner_id <> p_organization_id THEN
      RAISE EXCEPTION 'Supplier return can only use company-owned stock';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.storage_locations location
    JOIN public.cold_storages storage ON storage.id = location.cold_storage_id
    WHERE location.id = p_storage_location_id
      AND location.organization_id = p_organization_id AND location.active = true
      AND storage.id = p_cold_storage_id AND storage.warehouse_id = p_warehouse_id
      AND storage.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Return storage location is invalid or inactive';
  END IF;

  v_return_number := 'RET-' || to_char(now(), 'YYMMDDHH24MISSMS');
  INSERT INTO public.inventory_returns (
    organization_id, return_number, return_type, counterparty_id, reason, notes, performed_by
  ) VALUES (
    p_organization_id, v_return_number, p_return_type, p_counterparty_id,
    p_reason, p_notes, p_performed_by
  ) RETURNING id INTO v_return_id;

  INSERT INTO public.inventory_return_items (
    return_id, inventory_id, batch_id, product_id, warehouse_id, cold_storage_id,
    storage_location_id, quantity, quantity_kg, unit_id
  ) VALUES (
    v_return_id, CASE WHEN p_return_type = 'SUPPLIER_RETURN' THEN v_source.id ELSE NULL END,
    CASE WHEN p_return_type = 'SUPPLIER_RETURN' THEN v_source.batch_id ELSE p_batch_id END,
    CASE WHEN p_return_type = 'SUPPLIER_RETURN' THEN v_source.product_id ELSE p_product_id END,
    CASE WHEN p_return_type = 'SUPPLIER_RETURN' THEN v_source.warehouse_id ELSE p_warehouse_id END,
    CASE WHEN p_return_type = 'SUPPLIER_RETURN' THEN v_source.cold_storage_id ELSE p_cold_storage_id END,
    CASE WHEN p_return_type = 'SUPPLIER_RETURN' THEN v_source.storage_location_id ELSE p_storage_location_id END,
    p_quantity, p_quantity_kg,
    CASE WHEN p_return_type = 'SUPPLIER_RETURN' THEN v_source.unit_id ELSE p_unit_id END
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'INVENTORY_RETURN_CREATED',
    'inventory_return', v_return_id,
    jsonb_build_object('return_number', v_return_number, 'return_type', p_return_type, 'reason', p_reason)
  );
  RETURN v_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_inventory_return(
  p_return_id uuid,
  p_performed_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_return public.inventory_returns%ROWTYPE;
  v_approval_id uuid;
  v_director_role_id uuid;
BEGIN
  IF p_performed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Return actor does not match the authenticated user';
  END IF;
  SELECT * INTO v_return FROM public.inventory_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND OR v_return.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only draft returns can be submitted';
  END IF;
  IF NOT public.has_org_permission(v_return.organization_id, 'inventory.manage') THEN
    RAISE EXCEPTION 'Missing inventory.manage permission';
  END IF;
  INSERT INTO public.approval_requests (
    organization_id, entity_type, entity_id, requested_by, status, title, description
  ) VALUES (
    v_return.organization_id, 'INVENTORY_RETURN', p_return_id, p_performed_by,
    'PENDING', 'Return ' || v_return.return_number, v_return.return_type || ' requires Director approval.'
  ) RETURNING id INTO v_approval_id;
  SELECT id INTO v_director_role_id FROM public.roles WHERE code = 'DIRECTOR' LIMIT 1;
  INSERT INTO public.approval_steps (approval_request_id, step_number, approver_role_id, status)
  VALUES (v_approval_id, 1, v_director_role_id, 'PENDING');
  UPDATE public.inventory_returns
  SET status = 'PENDING_APPROVAL', approval_request_id = v_approval_id, updated_at = now()
  WHERE id = p_return_id;
  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_return.organization_id, p_performed_by, 'INVENTORY_RETURN_SUBMITTED',
    'inventory_return', p_return_id, jsonb_build_object('approval_request_id', v_approval_id)
  );
  RETURN v_approval_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_inventory_return(
  p_return_id uuid,
  p_performed_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_return public.inventory_returns%ROWTYPE;
  v_item public.inventory_return_items%ROWTYPE;
  v_inventory public.inventory%ROWTYPE;
  v_storage public.cold_storages%ROWTYPE;
  v_capacity numeric;
  v_occupied numeric;
  v_location_capacity numeric;
  v_location_occupied numeric;
  v_inventory_id uuid;
  v_movement_number text;
  v_movement_type text;
BEGIN
  SELECT * INTO v_return FROM public.inventory_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND OR v_return.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Approved return is required before processing';
  END IF;
  IF NOT public.is_org_director(p_performed_by, v_return.organization_id) THEN
    RAISE EXCEPTION 'Only a Director may process an approved return';
  END IF;
  SELECT * INTO v_item FROM public.inventory_return_items WHERE return_id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return item not found'; END IF;

  IF v_return.return_type = 'CUSTOMER_RETURN' THEN
    SELECT * INTO v_storage FROM public.cold_storages WHERE id = v_item.cold_storage_id FOR UPDATE;
    SELECT capacity_kg INTO v_location_capacity FROM public.storage_locations WHERE id = v_item.storage_location_id FOR UPDATE;
    SELECT COALESCE(SUM(quantity_kg), 0) INTO v_occupied
    FROM public.inventory WHERE cold_storage_id = v_item.cold_storage_id AND status IN ('AVAILABLE', 'QUARANTINE');
    IF v_occupied + v_item.quantity_kg > v_storage.capacity_kg THEN
      RAISE EXCEPTION 'Return exceeds cold storage capacity';
    END IF;
    SELECT COALESCE(SUM(quantity_kg), 0) INTO v_location_occupied
    FROM public.inventory WHERE storage_location_id = v_item.storage_location_id AND status IN ('AVAILABLE', 'QUARANTINE');
    IF v_location_occupied + v_item.quantity_kg > v_location_capacity THEN
      RAISE EXCEPTION 'Return exceeds storage location capacity';
    END IF;
    SELECT * INTO v_inventory FROM public.inventory
    WHERE organization_id = v_return.organization_id
      AND storage_location_id = v_item.storage_location_id
      AND batch_id = v_item.batch_id AND owner_type = 'COMPANY'
      AND owner_id = v_return.organization_id AND status = 'QUARANTINE'
    LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      v_inventory_id := v_inventory.id;
      UPDATE public.inventory SET quantity = quantity + v_item.quantity,
        quantity_kg = COALESCE(quantity_kg, 0) + v_item.quantity_kg, updated_at = now()
      WHERE id = v_inventory_id;
    ELSE
      INSERT INTO public.inventory (
        organization_id, warehouse_id, cold_storage_id, storage_location_id,
        product_id, batch_id, owner_type, owner_id, quantity, unit_id,
        quantity_kg, status, received_at, notes
      ) VALUES (
        v_return.organization_id, v_item.warehouse_id, v_item.cold_storage_id,
        v_item.storage_location_id, v_item.product_id, v_item.batch_id, 'COMPANY',
        v_return.organization_id, v_item.quantity, v_item.unit_id,
        v_item.quantity_kg, 'QUARANTINE', now(), 'Customer return pending QC'
      ) RETURNING id INTO v_inventory_id;
    END IF;
    v_movement_type := 'RETURN';
    v_movement_number := public.generate_movement_number(v_return.organization_id, 'RETURN');
    INSERT INTO public.inventory_movements (
      organization_id, movement_number, movement_type, inventory_id,
      batch_id, product_id, destination_warehouse_id, destination_cold_storage_id,
      destination_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
      source_entity_type, source_entity_id, reason, notes, performed_by
    ) VALUES (
      v_return.organization_id, v_movement_number, v_movement_type, v_inventory_id,
      v_item.batch_id, v_item.product_id, v_item.warehouse_id, v_item.cold_storage_id,
      v_item.storage_location_id, 'COMPANY', v_return.organization_id,
      v_item.quantity, v_item.unit_id, v_item.quantity_kg,
      'CUSTOMER_RETURN', p_return_id, v_return.reason, v_return.notes, p_performed_by
    );
  ELSE
    v_movement_type := 'ISSUE';
    SELECT * INTO v_inventory FROM public.inventory WHERE id = v_item.inventory_id FOR UPDATE;
    IF NOT FOUND OR v_inventory.status <> 'AVAILABLE'
       OR v_inventory.quantity < v_item.quantity
       OR COALESCE(v_inventory.quantity_kg, 0) < v_item.quantity_kg THEN
      RAISE EXCEPTION 'Supplier return source stock is no longer available';
    END IF;
    UPDATE public.inventory SET quantity = quantity - v_item.quantity,
      quantity_kg = quantity_kg - v_item.quantity_kg,
      status = CASE WHEN quantity - v_item.quantity <= 0 THEN 'BLOCKED' ELSE status END,
      updated_at = now()
    WHERE id = v_item.inventory_id;
    v_movement_number := public.generate_movement_number(v_return.organization_id, 'ISSUE');
    INSERT INTO public.inventory_movements (
      organization_id, movement_number, movement_type, inventory_id,
      batch_id, product_id, source_warehouse_id, source_cold_storage_id,
      source_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
      source_entity_type, source_entity_id, reason, notes, performed_by
    ) VALUES (
      v_return.organization_id, v_movement_number, 'ISSUE', v_item.inventory_id,
      v_item.batch_id, v_item.product_id, v_item.warehouse_id, v_item.cold_storage_id,
      v_item.storage_location_id, 'COMPANY', v_return.organization_id,
      v_item.quantity, v_item.unit_id, v_item.quantity_kg,
      'SUPPLIER_RETURN', p_return_id, v_return.reason, v_return.notes, p_performed_by
    );
  END IF;

  UPDATE public.inventory_returns SET status = 'APPROVED', approved_by = p_performed_by,
    approved_at = now(), updated_at = now() WHERE id = p_return_id;
  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_return.organization_id, p_performed_by, 'INVENTORY_RETURN_APPLIED',
    'inventory_return', p_return_id, jsonb_build_object('return_number', v_return.return_number, 'movement_type', v_movement_type)
  );
END;
$$;