-- Safe, repeatable bootstrap data for the Astadeca warehouse workspace.
-- Existing business records are reused and never deleted or reset.

DO $$
DECLARE
  v_organization_id uuid;
  v_business_unit_id uuid;
  v_warehouse_id uuid;
  v_cold_storage_1_id uuid;
  v_cold_storage_2_id uuid;
  v_location_id uuid;
  v_category_id uuid;
  v_unit_id uuid;
  v_product_id uuid;
  v_batch_id uuid;
  v_customer_id uuid;
  v_contract_id uuid;
  v_rate_id uuid;
  v_allocation_id uuid;
  v_approval_id uuid;
  v_actor_id uuid;
  v_director_role_id uuid;
  v_role_id uuid;
  v_permission_id uuid;
  v_seed record;
  v_role record;
BEGIN
  SELECT id INTO v_organization_id
  FROM public.organizations
  WHERE code = 'ASTADECA' OR name = 'ASTADECA BASWARA PERSADA'
  ORDER BY (code = 'ASTADECA') DESC
  LIMIT 1;

  IF v_organization_id IS NULL THEN
    INSERT INTO public.organizations (name, legal_name, code, is_active)
    VALUES ('ASTADECA BASWARA PERSADA', 'ASTADECA BASWARA PERSADA', 'ASTADECA', true)
    RETURNING id INTO v_organization_id;
  END IF;

  FOR v_role IN
    SELECT * FROM (VALUES
      ('DIRECTOR', 'Director'),
      ('ADMIN', 'Administrator'),
      ('PURCHASING', 'Purchasing'),
      ('WAREHOUSE', 'Warehouse'),
      ('SALES', 'Sales'),
      ('FINANCE', 'Finance'),
      ('DELIVERY', 'Delivery'),
      ('QC', 'Quality Control')
    ) AS roles(code, name)
  LOOP
    SELECT id INTO v_role_id FROM public.roles WHERE code = v_role.code LIMIT 1;
    IF v_role_id IS NULL THEN
      INSERT INTO public.roles (code, name, description, is_system)
      VALUES (v_role.code, v_role.name, 'System role', true)
      RETURNING id INTO v_role_id;
    END IF;
    IF v_role.code = 'DIRECTOR' THEN
      v_director_role_id := v_role_id;
    END IF;
    v_role_id := NULL;
  END LOOP;

  FOR v_seed IN
    SELECT * FROM (VALUES
      ('DIRECTOR', 'admin.master_data'), ('DIRECTOR', 'admin.users'),
      ('DIRECTOR', 'admin.settings'), ('DIRECTOR', 'purchasing.manage'),
      ('DIRECTOR', 'inventory.manage'), ('DIRECTOR', 'inventory.opname'),
      ('DIRECTOR', 'inventory.adjust'), ('DIRECTOR', 'inventory.transfer'),
      ('DIRECTOR', 'rental.manage'), ('DIRECTOR', 'rental.rate.manage'),
      ('DIRECTOR', 'rental.receive'), ('DIRECTOR', 'rental.release'),
      ('DIRECTOR', 'rental.billing'), ('DIRECTOR', 'sales.manage'),
      ('DIRECTOR', 'delivery.manage'), ('DIRECTOR', 'finance.receivables'),
      ('DIRECTOR', 'finance.payables'), ('DIRECTOR', 'finance.payments'),
      ('DIRECTOR', 'quality.manage'),
      ('ADMIN', 'admin.master_data'), ('ADMIN', 'admin.users'), ('ADMIN', 'admin.settings'),
      ('PURCHASING', 'purchasing.manage'),
      ('WAREHOUSE', 'inventory.manage'), ('WAREHOUSE', 'inventory.opname'),
      ('WAREHOUSE', 'inventory.adjust'), ('WAREHOUSE', 'inventory.transfer'),
      ('SALES', 'sales.manage'), ('SALES', 'delivery.manage'),
      ('FINANCE', 'finance.receivables'), ('FINANCE', 'finance.payables'),
      ('FINANCE', 'finance.payments'), ('DELIVERY', 'delivery.manage'),
      ('QC', 'quality.manage')
    ) AS grants(role_code, permission_code)
  LOOP
    SELECT id INTO v_role_id FROM public.roles WHERE code = v_seed.role_code LIMIT 1;
    SELECT id INTO v_permission_id
    FROM public.permissions
    WHERE code = v_seed.permission_code
    LIMIT 1;
    IF v_permission_id IS NULL THEN
      INSERT INTO public.permissions (code, name, module)
      VALUES (
        v_seed.permission_code,
        initcap(replace(v_seed.permission_code, '.', ' ')),
        split_part(v_seed.permission_code, '.', 1)
      )
      RETURNING id INTO v_permission_id;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.role_permissions
      WHERE role_id = v_role_id AND permission_id = v_permission_id
    ) THEN
      INSERT INTO public.role_permissions (role_id, permission_id)
      VALUES (v_role_id, v_permission_id);
    END IF;
    v_role_id := NULL;
    v_permission_id := NULL;
  END LOOP;

  INSERT INTO public.profiles (id, full_name)
  SELECT id, COALESCE(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')
  FROM auth.users
  ON CONFLICT (id) DO NOTHING;

  SELECT membership.user_id INTO v_actor_id
  FROM public.organization_memberships membership
  JOIN public.roles role_record ON role_record.id = membership.role_id
  WHERE membership.organization_id = v_organization_id
    AND membership.is_active = true
    AND role_record.code = 'DIRECTOR'
  ORDER BY membership.created_at
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.profiles
    WHERE is_active = true
    ORDER BY created_at
    LIMIT 1;

    IF v_actor_id IS NULL THEN
      RAISE EXCEPTION 'Bootstrap requires at least one authenticated profile';
    END IF;

    INSERT INTO public.organization_memberships (organization_id, user_id, role_id, is_active)
    VALUES (v_organization_id, v_actor_id, v_director_role_id, true);
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships membership
    JOIN public.roles role_record ON role_record.id = membership.role_id
    WHERE membership.organization_id = v_organization_id
      AND membership.is_active = true
      AND role_record.code = 'DIRECTOR'
  ) THEN
    UPDATE public.organization_memberships
    SET role_id = v_director_role_id, updated_at = now()
    WHERE organization_id = v_organization_id AND user_id = v_actor_id AND is_active = true;

    INSERT INTO public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, new_data
    ) SELECT
      v_organization_id, v_actor_id, 'BOOTSTRAP_DIRECTOR_ASSIGNED',
      'organization_membership', membership.id,
      jsonb_build_object('role', 'DIRECTOR', 'source', 'idempotent_activation_seed')
    FROM public.organization_memberships membership
    WHERE membership.organization_id = v_organization_id AND membership.user_id = v_actor_id;
  END IF;

  SELECT id INTO v_business_unit_id
  FROM public.business_units
  WHERE organization_id = v_organization_id AND code = 'NDA'
  LIMIT 1;
  IF v_business_unit_id IS NULL THEN
    INSERT INTO public.business_units (organization_id, code, name, unit_type, active)
    VALUES (v_organization_id, 'NDA', 'NAWASENA DAKARA ABADI', 'BUSINESS_UNIT', true)
    RETURNING id INTO v_business_unit_id;
  END IF;

  SELECT id INTO v_warehouse_id
  FROM public.warehouses
  WHERE organization_id = v_organization_id AND code = 'WH-COLD'
  LIMIT 1;
  IF v_warehouse_id IS NULL THEN
    INSERT INTO public.warehouses (organization_id, business_unit_id, code, name, warehouse_type, active)
    VALUES (v_organization_id, v_business_unit_id, 'WH-COLD', 'Cold Storage Warehouse', 'COLD_STORAGE', true)
    RETURNING id INTO v_warehouse_id;
  END IF;

  SELECT id INTO v_cold_storage_1_id FROM public.cold_storages
  WHERE organization_id = v_organization_id AND code = 'CS-01' LIMIT 1;
  IF v_cold_storage_1_id IS NULL THEN
    INSERT INTO public.cold_storages (organization_id, warehouse_id, code, name, capacity_kg, status)
    VALUES (v_organization_id, v_warehouse_id, 'CS-01', 'Cold Storage 01', 3000, 'ACTIVE')
    RETURNING id INTO v_cold_storage_1_id;
  END IF;

  SELECT id INTO v_cold_storage_2_id FROM public.cold_storages
  WHERE organization_id = v_organization_id AND code = 'CS-02' LIMIT 1;
  IF v_cold_storage_2_id IS NULL THEN
    INSERT INTO public.cold_storages (organization_id, warehouse_id, code, name, capacity_kg, status)
    VALUES (v_organization_id, v_warehouse_id, 'CS-02', 'Cold Storage 02', 3000, 'ACTIVE')
    RETURNING id INTO v_cold_storage_2_id;
  END IF;

  UPDATE public.cold_storages
  SET warehouse_id = v_warehouse_id,
      name = CASE code WHEN 'CS-01' THEN 'Cold Storage 01' ELSE 'Cold Storage 02' END,
      capacity_kg = 3000
  WHERE id IN (v_cold_storage_1_id, v_cold_storage_2_id);

  FOR v_seed IN
    SELECT * FROM (VALUES
      (v_cold_storage_1_id, 'A01'), (v_cold_storage_1_id, 'A02'), (v_cold_storage_1_id, 'A03'),
      (v_cold_storage_2_id, 'B01'), (v_cold_storage_2_id, 'B02'), (v_cold_storage_2_id, 'B03')
    ) AS locations(cold_storage_id, code)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.storage_locations
      WHERE cold_storage_id = v_seed.cold_storage_id AND code = v_seed.code
    ) THEN
      INSERT INTO public.storage_locations (organization_id, cold_storage_id, code, name, capacity_kg, active)
      VALUES (v_organization_id, v_seed.cold_storage_id, v_seed.code, v_seed.code, 1000, true);
    END IF;
  END LOOP;

  FOR v_seed IN
    SELECT * FROM (VALUES
      ('VEG', 'Sayuran'), ('FOOD', 'Makanan'), ('EGG', 'Telur'), ('FISH', 'Ikan'),
      ('CHICKEN', 'Ayam'), ('MEAT', 'Daging'), ('FROZEN', 'Frozen Food')
    ) AS categories(code, name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.product_categories
      WHERE organization_id = v_organization_id AND name = v_seed.name
    ) THEN
      INSERT INTO public.product_categories (organization_id, code, name, active)
      VALUES (v_organization_id, v_seed.code, v_seed.name, true);
    END IF;
  END LOOP;

  FOR v_seed IN
    SELECT * FROM (VALUES
      ('KG', 'Kilogram'), ('GRAM', 'Gram'), ('PCS', 'Pieces'),
      ('BOX', 'Box'), ('PACK', 'Pack'), ('TRAY', 'Tray')
    ) AS units(code, name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.units
      WHERE organization_id = v_organization_id AND code = v_seed.code
    ) THEN
      INSERT INTO public.units (organization_id, code, name, active)
      VALUES (v_organization_id, v_seed.code, v_seed.name, true);
    END IF;
  END LOOP;

  FOR v_seed IN
    SELECT * FROM (VALUES
      ('SUP-001', 'PT Segar Nusantara'), ('SUP-002', 'CV Mina Bahari'),
      ('SUP-003', 'PT Pangan Unggul'), ('SUP-004', 'CV Ternak Makmur'),
      ('SUP-005', 'PT Frozenindo Sejahtera')
    ) AS suppliers(code, name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.suppliers
      WHERE organization_id = v_organization_id AND code = v_seed.code
    ) THEN
      INSERT INTO public.suppliers (organization_id, code, name, active)
      VALUES (v_organization_id, v_seed.code, v_seed.name, true);
    END IF;
  END LOOP;

  FOR v_seed IN
    SELECT * FROM (VALUES
      ('CUST-001', 'PT Maju Pangan', true), ('CUST-002', 'PT Rasa Sejahtera', false),
      ('CUST-003', 'CV Dapur Prima', false), ('CUST-004', 'PT Boga Mandiri', false),
      ('CUST-005', 'CV Niaga Segar', false)
    ) AS customers(code, name, is_rental)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.customers
      WHERE organization_id = v_organization_id AND code = v_seed.code
    ) THEN
      INSERT INTO public.customers (
        organization_id, code, name, is_supply_chain_customer, is_rental_customer, active
      ) VALUES (
        v_organization_id, v_seed.code, v_seed.name, true, v_seed.is_rental, true
      );
    END IF;
  END LOOP;

  FOR v_seed IN
    SELECT * FROM (VALUES
      ('VEG-001', 'Brokoli', 'Sayuran', 'KG'),
      ('VEG-002', 'Wortel', 'Sayuran', 'KG'),
      ('VEG-003', 'Bayam', 'Sayuran', 'KG'),
      ('VEG-004', 'Bawang Merah', 'Sayuran', 'KG'),
      ('FOOD-001', 'Kentang', 'Makanan', 'KG'),
      ('EGG-001', 'Telur Ayam', 'Telur', 'TRAY'),
      ('FISH-001', 'Ikan Dori', 'Ikan', 'KG'),
      ('FISH-002', 'Ikan Salmon', 'Ikan', 'KG'),
      ('CHICK-001', 'Daging Ayam Fillet', 'Ayam', 'KG'),
      ('CHICK-002', 'Ayam Utuh', 'Ayam', 'KG'),
      ('MEAT-001', 'Daging Sapi', 'Daging', 'KG'),
      ('MEAT-002', 'Daging Kambing', 'Daging', 'KG'),
      ('FROZEN-001', 'Sosis Sapi', 'Frozen Food', 'PACK'),
      ('FROZEN-002', 'Kentang Goreng Frozen', 'Frozen Food', 'KG'),
      ('FROZEN-003', 'Udang', 'Ikan', 'KG'),
      ('FROZEN-004', 'Mix Vegetables Frozen', 'Frozen Food', 'KG'),
      ('VEG-005', 'Sayuran Campur', 'Sayuran', 'KG')
    ) AS products(sku, name, category_name, unit_code)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE organization_id = v_organization_id AND sku = v_seed.sku
    ) THEN
      SELECT id INTO v_category_id FROM public.product_categories
      WHERE organization_id = v_organization_id AND name = v_seed.category_name
      ORDER BY created_at LIMIT 1;
      SELECT id INTO v_unit_id FROM public.units
      WHERE organization_id = v_organization_id AND code = v_seed.unit_code
      ORDER BY created_at LIMIT 1;
      INSERT INTO public.products (organization_id, category_id, unit_id, sku, name, active)
      VALUES (v_organization_id, v_category_id, v_unit_id, v_seed.sku, v_seed.name, true);
    END IF;
  END LOOP;

  IF v_actor_id IS NOT NULL THEN
    FOR v_seed IN
      SELECT * FROM (VALUES
        ('Daging Ayam Fillet', 'AY-260901', 'CS-01', 'A01', 500::numeric, 'SEED-AST-CHICKEN'),
        ('Daging Sapi', 'DS-260901', 'CS-01', 'A02', 350::numeric, 'SEED-AST-BEEF'),
        ('Ikan Dori', 'ID-260901', 'CS-02', 'B01', 250::numeric, 'SEED-AST-DORY'),
        ('Udang', 'UD-260901', 'CS-02', 'B02', 150::numeric, 'SEED-AST-SHRIMP')
      ) AS stock(product_name, batch_number, storage_code, location_code, quantity_kg, reference_number)
    LOOP
      SELECT id INTO v_product_id FROM public.products
      WHERE organization_id = v_organization_id AND name = v_seed.product_name
      ORDER BY created_at LIMIT 1;
      SELECT id INTO v_unit_id FROM public.units
      WHERE organization_id = v_organization_id AND code = 'KG'
      ORDER BY created_at LIMIT 1;
      SELECT id INTO v_cold_storage_1_id FROM public.cold_storages
      WHERE organization_id = v_organization_id AND code = v_seed.storage_code
      LIMIT 1;
      SELECT id INTO v_location_id FROM public.storage_locations
      WHERE cold_storage_id = v_cold_storage_1_id AND code = v_seed.location_code
      LIMIT 1;
      SELECT id INTO v_batch_id FROM public.batches
      WHERE organization_id = v_organization_id AND product_id = v_product_id
        AND batch_number = v_seed.batch_number
      LIMIT 1;

      IF v_batch_id IS NULL THEN
        INSERT INTO public.batches (
          organization_id, product_id, batch_number, received_date, production_date, expiry_date
        ) VALUES (
          v_organization_id, v_product_id, v_seed.batch_number,
          CURRENT_DATE, DATE '2026-09-01', DATE '2027-09-01'
        ) RETURNING id INTO v_batch_id;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.inventory
        WHERE organization_id = v_organization_id AND batch_id = v_batch_id
          AND storage_location_id = v_location_id AND owner_type = 'COMPANY'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.inventory_movements
        WHERE organization_id = v_organization_id AND reference_number = v_seed.reference_number
      ) THEN
        PERFORM public.receive_inventory(
          v_organization_id, v_warehouse_id, v_cold_storage_1_id, v_location_id,
          v_product_id, v_batch_id, 'COMPANY', v_organization_id,
          v_seed.quantity_kg, v_unit_id, v_seed.quantity_kg,
          v_seed.reference_number, 'Initial idempotent bootstrap receipt', v_actor_id
        );
      END IF;
      v_product_id := NULL;
      v_unit_id := NULL;
      v_batch_id := NULL;
      v_location_id := NULL;
    END LOOP;

    SELECT id INTO v_customer_id FROM public.customers
    WHERE organization_id = v_organization_id AND code = 'CUST-001'
    ORDER BY created_at LIMIT 1;
    SELECT id INTO v_product_id FROM public.products
    WHERE organization_id = v_organization_id AND sku = 'VEG-005'
    LIMIT 1;
    SELECT id INTO v_unit_id FROM public.units
    WHERE organization_id = v_organization_id AND code = 'KG'
    ORDER BY created_at LIMIT 1;

    SELECT id INTO v_contract_id FROM public.rental_contracts
    WHERE organization_id = v_organization_id AND contract_number = 'RNT-SEED-MAJU-PANGAN'
    LIMIT 1;
    IF v_contract_id IS NULL THEN
      INSERT INTO public.rental_contracts (
        organization_id, contract_number, customer_id, title, status,
        start_date, end_date, billing_frequency, payment_terms_days, created_by
      ) VALUES (
        v_organization_id, 'RNT-SEED-MAJU-PANGAN', v_customer_id,
        'Cold storage CS-02 - PT Maju Pangan', 'DRAFT',
        CURRENT_DATE, CURRENT_DATE + 365, 'DAILY', 30, v_actor_id
      ) RETURNING id INTO v_contract_id;
    END IF;

    SELECT approval_request_id INTO v_approval_id FROM public.rental_contracts
    WHERE id = v_contract_id;
    IF v_approval_id IS NULL THEN
      INSERT INTO public.approval_requests (
        organization_id, entity_type, entity_id, requested_by, status,
        title, description, completed_at
      ) VALUES (
        v_organization_id, 'RENTAL_CONTRACT', v_contract_id, v_actor_id, 'APPROVED',
        'Bootstrap approval: PT Maju Pangan rental contract',
        'Approved bootstrap contract for initial rental workflow data.', now()
      ) RETURNING id INTO v_approval_id;
      INSERT INTO public.approval_steps (
        approval_request_id, step_number, approver_role_id, assigned_user_id, status, acted_at
      ) VALUES (v_approval_id, 1, v_director_role_id, v_actor_id, 'APPROVED', now());
      INSERT INTO public.approval_actions (
        approval_request_id, acted_by, action, comment
      ) VALUES (v_approval_id, v_actor_id, 'APPROVE', 'Initial bootstrap approval');
      UPDATE public.rental_contracts
      SET approval_request_id = v_approval_id, status = 'PENDING_APPROVAL'
      WHERE id = v_contract_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.rental_contracts
      WHERE id = v_contract_id AND status <> 'ACTIVE'
        AND approval_request_id = v_approval_id
    ) THEN
      PERFORM public.activate_rental_contract(v_contract_id, v_actor_id);
    END IF;

    SELECT id INTO v_rate_id FROM public.rental_rates
    WHERE organization_id = v_organization_id AND customer_id = v_customer_id
      AND cold_storage_id = v_cold_storage_2_id AND status = 'ACTIVE'
      AND rate_per_kg_day = 100 AND effective_from <= CURRENT_DATE
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    LIMIT 1;
    IF v_rate_id IS NULL THEN
      v_rate_id := public.create_rental_rate(
        v_organization_id, 'CUSTOMER', v_customer_id, v_cold_storage_2_id,
        NULL, NULL, NULL, 100, 0, CURRENT_DATE, NULL,
        'Initial PT Maju Pangan rate: IDR 100 per KG per day', v_actor_id
      );
    END IF;

    SELECT id INTO v_batch_id FROM public.batches
    WHERE organization_id = v_organization_id AND product_id = v_product_id
      AND batch_number = 'MP-260926'
    LIMIT 1;
    IF v_batch_id IS NULL THEN
      INSERT INTO public.batches (
        organization_id, product_id, batch_number, received_date, production_date, expiry_date
      ) VALUES (
        v_organization_id, v_product_id, 'MP-260926', CURRENT_DATE,
        CURRENT_DATE, CURRENT_DATE + 180
      ) RETURNING id INTO v_batch_id;
    END IF;

    SELECT id INTO v_location_id FROM public.storage_locations
    WHERE cold_storage_id = v_cold_storage_2_id AND code = 'B03'
    LIMIT 1;
    IF NOT EXISTS (
      SELECT 1 FROM public.rental_stock_movements
      WHERE organization_id = v_organization_id AND contract_id = v_contract_id
        AND movement_type = 'RECEIVE' AND batch_id = v_batch_id
    ) THEN
      SELECT allocation_id INTO v_allocation_id
      FROM public.receive_rental_stock(
        v_organization_id, v_contract_id, v_customer_id, v_product_id, v_batch_id,
        v_cold_storage_2_id, v_location_id, 1000, 1000, v_unit_id,
        'SEED-RENTAL-MAJU-PANGAN', 'Initial 1000 KG customer-owned rental receipt', v_actor_id
      );
    ELSE
      SELECT id INTO v_allocation_id FROM public.rental_allocations
      WHERE organization_id = v_organization_id AND contract_id = v_contract_id
        AND batch_id = v_batch_id
      ORDER BY created_at LIMIT 1;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.rental_charges
      WHERE organization_id = v_organization_id AND contract_id = v_contract_id
        AND billing_start = CURRENT_DATE AND billing_end = CURRENT_DATE + 1
    ) THEN
      PERFORM public.calculate_rental_charges(
        v_organization_id, CURRENT_DATE, CURRENT_DATE + 1, v_contract_id, v_actor_id
      );
    END IF;
  END IF;
END;
$$;