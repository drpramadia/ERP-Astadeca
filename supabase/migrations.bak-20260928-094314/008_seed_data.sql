-- Migration: 008_seed_data.sql
-- Description: Seed data for ASTADECA BASWARA PERSADA (IDEMPOTENT)
-- Safety: Uses ON CONFLICT to avoid duplicates

-- PRODUCT CATEGORIES
INSERT INTO public.product_categories (organization_id, code, name, description) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'VEG', 'Sayuran', 'Produk sayuran segar dan frozen'),
  ('00000000-0000-0000-0000-000000000001', 'MF', 'Makanan', 'Makanan siap saji dan frozen'),
  ('00000000-0000-0000-0000-000000000001', 'EGG', 'Telur', 'Telur ayam dan produk telur'),
  ('00000000-0000-0000-0000-000000000001', 'FISH', 'Ikan', 'Produk ikan segar dan frozen'),
  ('00000000-0000-0000-0000-000000000001', 'CHICKEN', 'Ayam', 'Produk ayam segar dan frozen'),
  ('00000000-0000-0000-0000-000000000001', 'MEAT', 'Daging', 'Daging sapi dan produk daging'),
  ('00000000-0000-0000-0000-000000000001', 'FF', 'Frozen Food', 'Makanan frozen siap saji')
ON CONFLICT (organization_id, code) DO NOTHING;

-- UNITS
INSERT INTO public.units (organization_id, code, name, description) VALUES 
  ('00000000-0000-0000-0000-000000000001', 'KG', 'Kilogram', 'Satuan berat kilogram'),
  ('00000000-0000-0000-0000-000000000001', 'GRAM', 'Gram', 'Satuan berat gram'),
  ('00000000-0000-0000-0000-000000000001', 'PCS', 'Piece', 'Satuan buah'),
  ('00000000-0000-0000-0000-000000000001', 'BOX', 'Box', 'Satuan kotak'),
  ('00000000-0000-0000-0000-000000000001', 'PACK', 'Pack', 'Satuan pack'),
  ('00000000-0000-0000-0000-000000000001', 'TRAY', 'Tray', 'Satuan tray')
ON CONFLICT (organization_id, code) DO NOTHING;

-- GET IDS
DO $$
DECLARE
  v_kg_id uuid;
  v_chicken_id uuid;
  v_meat_id uuid;
  v_fish_id uuid;
  v_egg_id uuid;
  v_veg_id uuid;
  v_ff_id uuid;
BEGIN
  SELECT id INTO v_kg_id FROM public.units WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND code = 'KG';
  SELECT id INTO v_chicken_id FROM public.product_categories WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND code = 'CHICKEN';
  SELECT id INTO v_meat_id FROM public.product_categories WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND code = 'MEAT';
  SELECT id INTO v_fish_id FROM public.product_categories WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND code = 'FISH';
  SELECT id INTO v_egg_id FROM public.product_categories WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND code = 'EGG';
  SELECT id INTO v_veg_id FROM public.product_categories WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND code = 'VEG';
  SELECT id INTO v_ff_id FROM public.product_categories WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND code = 'FF';

  -- PRODUCTS
  INSERT INTO public.products (organization_id, category_id, unit_id, sku, name, description, brand, purchase_price, selling_price, min_stock, max_stock, track_batch, track_expiry) VALUES 
    ('00000000-0000-0000-0000-000000000001', v_chicken_id, v_kg_id, 'DGN-FILL-001', 'Daging Ayam Fillet', 'Frozen fillet ayam porsi harian', 'NAWASENA', 45000.00, 65000.00, 200.00, 1000.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_chicken_id, v_kg_id, 'AYAM-UTUH', 'Ayam Utuh', 'Ayam utuh broiler/bekas dipotong', 'NAWASENA', 35000.00, 55000.00, 100.00, 500.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_meat_id, v_kg_id, 'DGS-SAP-001', 'Daging Sapi', 'Daging sapi segar potong', 'NAWASENA', 85000.00, 120000.00, 100.00, 500.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_meat_id, v_kg_id, 'DGS-SLP-001', 'Daging Sapi Slice', 'Daging sapi irisan tipis ready to cook', 'NAWASENA', 95000.00, 140000.00, 50.00, 300.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_fish_id, v_kg_id, 'IKN-DOR-001', 'Ikan Dori', 'Ikan dori segar/frozen', 'NAWASENA', 75000.00, 110000.00, 100.00, 500.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_fish_id, v_kg_id, 'IKN-SLM-001', 'Ikan Salmon', 'Ikan salmon fillet premium', 'NAWASENA', 120000.00, 160000.00, 50.00, 300.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_fish_id, v_kg_id, 'UDN-GRN-001', 'Udang', 'Udang vaname segar', 'NAWASENA', 110000.00, 150000.00, 50.00, 300.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_egg_id, v_kg_id, 'TLG-AYM-001', 'Telur Ayam', 'Telur ayam kampung', 'NAWASENA', 25000.00, 35000.00, 100.00, 1000.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_veg_id, v_kg_id, 'KTG-SEG-001', 'Kentang', 'Kentang segar', 'NAWASENA', 15000.00, 25000.00, 100.00, 500.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_veg_id, v_kg_id, 'WRT-SEG-001', 'Wortel', 'Wortel segar', 'NAWASENA', 12000.00, 20000.00, 100.00, 500.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_veg_id, v_kg_id, 'BLK-FRZ-001', 'Brokoli Frozen', 'Brokoli frozen ready to cook', 'NAWASENA', 18000.00, 28000.00, 100.00, 500.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_veg_id, v_kg_id, 'JGM-FRZ-001', 'Jagung Frozen', 'Jagung manis frozen', 'NAWASENA', 14000.00, 22000.00, 100.00, 500.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_ff_id, v_kg_id, 'FFR-FREN-001', 'Frozen French Fries', 'French fries beku', 'NAWASENA', 12000.00, 18000.00, 200.00, 1000.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_ff_id, v_kg_id, 'NGT-AYM-001', 'Nugget Ayam', 'Nugget ayam frozen', 'NAWASENA', 15000.00, 22000.00, 200.00, 1000.00, true, true),
    ('00000000-0000-0000-0000-000000000001', v_ff_id, v_kg_id, 'SGS-AYM-001', 'Sosis Ayam', 'Sosis ayam frozen', 'NAWASENA', 13000.00, 20000.00, 200.00, 1000.00, true, true)
  ON CONFLICT (organization_id, sku) DO NOTHING;
END $$;
