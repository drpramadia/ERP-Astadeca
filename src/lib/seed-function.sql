
-- SEED FUNCTION: Create seed data for ASTADECA BASWARA PERSADA
-- Run: SELECT public.seed_initial_data('YOUR_ORG_ID');
-- This function creates seed data idempotently

CREATE OR REPLACE FUNCTION public.seed_initial_data(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_result jsonb;
  v_category_id uuid;
  v_unit_id uuid;
  v_product_id uuid;
  v_supplier_id uuid;
  v_customer_id uuid;
  v_batch_id uuid;
  v_movement_id uuid;
  v_inventory_id uuid;
  v_warehouse_id uuid;
  v_cs_id uuid;
  v_loc_id uuid;
  v_std_rate_id uuid;
  v_contract_id uuid;
  v_alloc_id uuid;
  v_charge_id uuid;
  v_invoice_id uuid;
  v_po_id uuid;
  v_pr_id uuid;
  v_so_id uuid;
  v_do_id uuid;
  v_quota_id uuid;
  v_qc_id uuid;
  v_return_id uuid;
  v_opname_id uuid;
  v_adjustment_id uuid;
  v_transfer_id uuid;
  v_approval_req_id uuid;
  v_approval_step_id uuid;
  v_approval_action_id uuid;
  v_audit_id uuid;
  v_return_json jsonb;
  v_company_uuid uuid := '00000000-0000-0000-0000-000000000001'; -- Company owner type
BEGIN
  v_return_json := jsonb_build_object('success', false, 'message', '');

  -- Check organization exists
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id) THEN
    v_return_json := jsonb_build_object('success', false, 'message', 'Organization not found: ' || p_org_id);
    RETURN v_return_json;
  END IF;

  -- ============================================
  -- SEED: Product Categories (if not exist)
  -- ============================================
  INSERT INTO public.product_categories (organization_id, code, name, description)
  VALUES 
    (p_org_id, 'VEG', 'Sayuran', 'Produk sayuran segar dan frozen'),
    (p_org_id, 'MF', 'Makanan', 'Makanan siap saji dan frozen'),
    (p_org_id, 'EGG', 'Telur', 'Telur ayam dan produk telur'),
    (p_org_id, 'FISH', 'Ikan', 'Produk ikan segar dan frozen'),
    (p_org_id, 'CHICKEN', 'Ayam', 'Produk ayam segar dan frozen'),
    (p_org_id, 'MEAT', 'Daging', 'Daging sapi dan produk daging'),
    (p_org_id, 'FF', 'Frozen Food', 'Makanan frozen siap saji')
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- Get category IDs
  SELECT id INTO v_category_id FROM public.product_categories WHERE organization_id = p_org_id AND code = 'CHICKEN';
  SELECT id INTO v_unit_id FROM public.units WHERE organization_id = p_org_id AND code = 'KG';

  -- ============================================
  -- SEED: Units (if not exist)
  -- ============================================
  INSERT INTO public.units (organization_id, code, name, description)
  VALUES 
    (p_org_id, 'KG', 'Kilogram', 'Satuan berat kilogram'),
    (p_org_id, 'GRAM', 'Gram', 'Satuan berat gram'),
    (p_org_id, 'PCS', 'Piece', 'Satuan buah'),
    (p_org_id, 'BOX', 'Box', 'Satuan kotak'),
    (p_org_id, 'PACK', 'Pack', 'Satuan pack'),
    (p_org_id, 'TRAY', 'Tray', 'Satuan tray')
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- ============================================
  -- SEED: Products (if not exist)
  -- ============================================
  INSERT INTO public.products (organization_id, category_id, unit_id, sku, name, description, brand, purchase_price, selling_price, min_stock, max_stock, track_batch, track_expiry)
  VALUES 
    (p_org_id, v_category_id, v_unit_id, 'DGN-FILL-001', 'Daging Ayam Fillet', 'Frozen fillet ayam porsi harian', 'NAWASENA', 45000.00, 65000.00, 200.00, 1000.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'AYAM-UTUH', 'Ayam Utuh', 'Ayam utuh broiler/bekas dipotong', 'NAWASENA', 35000.00, 55000.00, 100.00, 500.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'DGS-SAP-001', 'Daging Sapi', 'Daging sapi segar potong', 'NAWASENA', 85000.00, 120000.00, 100.00, 500.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'DGS-SLP-001', 'Daging Sapi Slice', 'Daging sapi irisan tipis ready to cook', 'NAWASENA', 95000.00, 140000.00, 50.00, 300.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'IKN-DOR-001', 'Ikan Dori', 'Ikan dori segar/frozen', 'NAWASENA', 75000.00, 110000.00, 100.00, 500.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'IKN-SLM-001', 'Ikan Salmon', 'Ikan salmon fillet premium', 'NAWASENA', 120000.00, 160000.00, 50.00, 300.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'UDN-GRN-001', 'Udang', 'Udang vaname segar', 'NAWASENA', 110000.00, 150000.00, 50.00, 300.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'TLG-AYM-001', 'Telur Ayam', 'Telur ayam kampung', 'NAWASENA', 25000.00, 35000.00, 100.00, 1000.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'KTG-SEG-001', 'Kentang', 'Kentang segar', 'NAWASENA', 15000.00, 25000.00, 100.00, 500.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'WRT-SEG-001', 'Wortel', 'Wortel segar', 'NAWASENA', 12000.00, 20000.00, 100.00, 500.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'BLK-FRZ-001', 'Brokoli Frozen', 'Brokoli frozen ready to cook', 'NAWASENA', 18000.00, 28000.00, 100.00, 500.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'JGM-FRZ-001', 'Jagung Frozen', 'Jagung manis frozen', 'NAWASENA', 14000.00, 22000.00, 100.00, 500.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'FFR-FREN-001', 'Frozen French Fries', 'French fries beku', 'NAWASENA', 12000.00, 18000.00, 200.00, 1000.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'NGT-AYM-001', 'Nugget Ayam', 'Nugget ayam frozen', 'NAWASENA', 15000.00, 22000.00, 200.00, 1000.00, true, true),
    (p_org_id, v_category_id, v_unit_id, 'SGS-AYM-001', 'Sosis Ayam', 'Sosis ayam frozen', 'NAWASENA', 13000.00, 20000.00, 200.00, 1000.00, true, true)
  ON CONFLICT (organization_id, sku) DO NOTHING;

  -- ============================================
  -- SEED: Suppliers (if not exist)
  -- ============================================
  INSERT INTO public.suppliers (organization_id, code, name, supplier_type, contact_person, phone, email, address, payment_terms_days)
  VALUES 
    (p_org_id, 'SUP-AYAM', 'Supplier Ayam Nusantara', 'POULTRY', 'Budi Santoso', '081234567890', 'budi@ayamnusantara.co.id', 'Jl. Raya Bogor No. 123, Bogor', 14),
    (p_org_id, 'SUP-DG', 'Supplier Daging Bandung', 'MEAT', 'Agus Wijaya', '081234567891', 'agus@dagingbandung.co.id', 'Jl. Asia Afrika No. 45, Bandung', 14),
    (p_org_id, 'SUP-SEA', 'Supplier Seafood Jawa Barat', 'SEAFOOD', 'Yusuf Hermawan', '081234567892', 'yusuf@seafoodjabar.co.id', 'Jl. Pelabuhan Fish No. 88, Cikarang', 7),
    (p_org_id, 'SUP-SAYUR', 'Supplier Sayur Lembang', 'VEGETABLE', 'Rina Dewi', '081234567893', 'rina@sayurlembang.co.id', 'Jl. Lembang No. 77, Bandung', 7),
    (p_org_id, 'SUP-FF', 'Supplier Frozen Food Bandung', 'PROCESSED', 'Dian Pratama', '081234567894', 'dian@frozenfoodbdg.co.id', 'Jl. Industri No. 99, Cikarang', 14)
  ON CONFLICT (organization_id, code) DO NOTHING;

  -- ============================================
  -- SEED: Customers (if not exist)
  -- ============================================
  INSERT INTO public.customers (organization_id, code, name, customer_type, contact_person, phone, email, address, is_supply_chain_customer, is_rental_customer, payment_terms_days)
  VALUES 
    (p_org_id, 'CST-001', 'PT Maju Pangan', 'CORPORATE', 'Ahmad Rizal', '081234567801', 'ahmad@majupangan.co.id', 'Jl. Industri Food No. 10, Jakarta', true, true, 30),
    (p_org_id, 'CST-002', 'CV Nusantara Food', 'CORPORATE', 'Siti Nurhaliza', '081234567802', 'siti@nusantarafood.co.id', 'Jl. Pangan No. 22, Surabaya', true, true, 30),
    (p_org_id, 'CST-003', 'Koperasi Sejahtera', 'COOPERATIVE', 'Hj. Siti Aminah', '081234567803', 'haji@sejahtera.co.id', 'Jl. Koperasi No. 5, Bandung', true, false, 14),
    (p_org_id, 'CST-004', 'Yayasan Pangan Bersama', 'NGO', 'Dr. Budi Hartono', '081234567804', 'budi@panganbersama.org', 'Jl. Sosial No. 12, Yogyakarta', true, false, 30),
    (p_org_id, 'CST-005', 'Rental Customer 01', 'CORPORATE', 'Andi Wijaya', '081234567805', 'andi@rental01.co.id', 'Jl. Rental No. 1, Tangerang', false, true, 15)
  ON CONFLICT (organization_id, code) DO NOTHING;

  v_return_json := jsonb_build_object('success', true, 'message', 'Master data seeded', 'categories', 7, 'products', 15, 'suppliers', 5, 'customers', 5);
  RETURN v_return_json;
END;
$$ LANGUAGE plpgsql;
