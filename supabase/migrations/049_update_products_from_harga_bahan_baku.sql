-- Migration: 049_update_products_from_harga_bahan_baku.sql
-- Source: HARGA BAHAN BAKU PER TGL 28/09/ - 04/10/2026
-- HARGA ASLI  = purchase_price (harga beli / supplier)
-- HARGA       = selling_price  (harga jual ke customer)
-- Units: kg→KG, pcs→PCS, ekor→Ekor, gram→Gram
-- Date: 2026-09-29

-- ============================================================
-- 1. Create upsert helper (must be standalone, not inside DO $$)
-- ============================================================
DO $$
BEGIN
  DROP FUNCTION IF EXISTS public.upsert_product(text,text,numeric,numeric,uuid,uuid) CASCADE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.upsert_product(
  p_name            text,
  p_sku             text,
  p_purchase_price  numeric,
  p_selling_price   numeric,
  p_category_id     uuid,
  p_unit_id         uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  INSERT INTO public.products (
    id, organization_id, category_id, unit_id, sku, name,
    purchase_price, selling_price, track_batch, track_expiry, active
  ) VALUES (
    gen_random_uuid(),
    'a4ae3325-7073-4a64-bd7c-045d591f5e29',
    p_category_id,
    p_unit_id,
    p_sku, p_name,
    p_purchase_price, p_selling_price,
    true, true, true
  )
  ON CONFLICT (organization_id, sku) DO UPDATE SET
    name           = EXCLUDED.name,
    category_id   = EXCLUDED.category_id,
    unit_id       = EXCLUDED.unit_id,
    purchase_price = EXCLUDED.purchase_price,
    selling_price = EXCLUDED.selling_price,
    active        = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_product(text,text,numeric,numeric,uuid,uuid) TO authenticated;

-- ============================================================
-- 2. IKAN & SEAFOOD
-- u_kg = Fish, u_sea = Seafood
-- ============================================================
DO $$
DECLARE
  u_fish   uuid := '7c82676c-37db-4cf2-9ef9-b5ecc8b5a232';
  u_seafood uuid := 'f93de256-6bad-b703-b967-61e8167c12ce';
  u_kg    uuid := 'b089b260-bd8f-4a08-a72b-ae2c6375fb34';
BEGIN
  PERFORM public.upsert_product('Kerapu Macan','IKAN-001',135000,135000,u_fish,u_kg);
  PERFORM public.upsert_product('Kerapu','IKAN-002',45000,72000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Layur (Isi 4-5 Ekor)','IKAN-003',51000,81600,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Kakap Merah','IKAN-004',70000,112000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Kakap Putih','IKAN-005',70000,112000,u_fish,u_kg);
  PERFORM public.upsert_product('Balakutak','IKAN-006',70000,112000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Gurame','IKAN-007',50000,80000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Nila Merah','IKAN-008',35000,56000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Nila Hitam','IKAN-009',32000,52000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Patin','IKAN-010',35000,56000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Bawal Hitam','IKAN-011',65000,104000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Bawal Putih','IKAN-012',130000,208000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Baracuda','IKAN-013',45000,72000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Selar','IKAN-014',48000,76800,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Gembung','IKAN-015',50000,80000,u_fish,u_kg);
  PERFORM public.upsert_product('Ikan Kue','IKAN-016',65000,104000,u_fish,u_kg);
  PERFORM public.upsert_product('Cumi Sero (Sz. 15)','SEA-001',110000,176000,u_seafood,u_kg);
  PERFORM public.upsert_product('Baby Octopus','SEA-002',65000,104000,u_seafood,u_kg);
  PERFORM public.upsert_product('Belut','SEA-003',60000,96000,u_seafood,u_kg);
  PERFORM public.upsert_product('Udang Windu','SEA-004',95000,152000,u_seafood,u_kg);
  PERFORM public.upsert_product('Kepiting (4 Ekor)','SEA-005',90000,144000,u_seafood,u_kg);
  PERFORM public.upsert_product('Kerang Dara','SEA-006',45000,72000,u_seafood,u_kg);
  PERFORM public.upsert_product('Kerang Tahu','SEA-007',45000,72000,u_seafood,u_kg);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. AYAM, DAGING, TELUR
-- ============================================================
DO $$
DECLARE
  u_chicken uuid := '069bc52a-a254-4f73-91a5-1f7f699ef617';
  u_meat    uuid := '029c0626-5a19-40e6-a4fb-66555dbb2ec4';
  u_eggs    uuid := '74175331-3a07-4b7c-8e92-eb226106a528';
  u_kg      uuid := 'b089b260-bd8f-4a08-a72b-ae2c6375fb34';
  u_ekor    uuid := '06c9ffb5-bd08-864a-0ef4-0309fe37bd5c';
  u_gram    uuid := '5dbd334d-c585-4286-942e-212fc9864872';
BEGIN
  PERFORM public.upsert_product('Ayam Kampung','AYAM-001',70000,112000,u_chicken,u_ekor);
  -- Ayam Pejantan: PDF 37.000/800g = 46250/kg | 59.200/800g = 74000/kg
  PERFORM public.upsert_product('Ayam Pejantan','AYAM-002',46250,74000,u_chicken,u_gram);
  PERFORM public.upsert_product('Daging Sapi Paha','MEAT-001',155000,248000,u_meat,u_kg);
  PERFORM public.upsert_product('Daging Sapi Lamusir','MEAT-002',150000,240000,u_meat,u_kg);
  PERFORM public.upsert_product('Telur','EGG-001',23500,27000,u_eggs,u_kg);
  PERFORM public.upsert_product('Ayam Giling','AYAM-003',51500,82400,u_chicken,u_kg);
  PERFORM public.upsert_product('Fillet Paha','AYAM-004',50500,80800,u_chicken,u_kg);
  PERFORM public.upsert_product('Fillet Dada','AYAM-005',51500,82400,u_chicken,u_kg);
  PERFORM public.upsert_product('Sayap','AYAM-006',41500,66400,u_chicken,u_kg);
  PERFORM public.upsert_product('Paha Pentung','AYAM-007',42500,68000,u_chicken,u_kg);
  PERFORM public.upsert_product('Ayam Potong','AYAM-008',39000,62400,u_chicken,u_kg);
  PERFORM public.upsert_product('Bebek Utuh (1,3 Kg)','AYAM-009',66000,99000,u_chicken,u_kg);
  PERFORM public.upsert_product('Ribs (Iga)','MEAT-003',105000,157500,u_meat,u_kg);
  PERFORM public.upsert_product('Daging Iga','MEAT-004',125000,187500,u_meat,u_kg);
  PERFORM public.upsert_product('Oxtail (Buntut Sapi)','MEAT-005',95000,142500,u_meat,u_kg);
  PERFORM public.upsert_product('Tulang Jambal','MEAT-006',35000,56000,u_meat,u_kg);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. SAYURAN & BUMBU
-- ============================================================
DO $$
DECLARE
  u_veg  uuid := 'c9f5d39b-1d51-4ae9-a409-f52d013f8cad';
  u_ing  uuid := '01378399-58c3-4caf-a2d1-33fe2ea976e2';
  u_sea  uuid := 'f93de256-6bad-b703-b967-61e8167c12ce';
  u_kg   uuid := 'b089b260-bd8f-4a08-a72b-ae2c6375fb34';
  u_pcs  uuid := '181a9ca4-f95e-4c92-9897-f3d5a2e2fef0';
BEGIN
  PERFORM public.upsert_product('Bawang Bombay','VEG-001',26000,41600,u_veg,u_kg);
  PERFORM public.upsert_product('Bawang Merah','VEG-002',31000,49600,u_veg,u_kg);
  PERFORM public.upsert_product('Bawang Putih','VEG-003',34000,54400,u_veg,u_kg);
  PERFORM public.upsert_product('Cabe Hijau Keriting','VEG-004',50000,80000,u_veg,u_kg);
  PERFORM public.upsert_product('Cabe Merah Besar','VEG-005',60000,66000,u_veg,u_kg);
  PERFORM public.upsert_product('Cabe Merah Keriting','VEG-006',55000,88000,u_veg,u_kg);
  PERFORM public.upsert_product('Cabe Rawit Hijau','VEG-007',50000,80000,u_veg,u_kg);
  PERFORM public.upsert_product('Cabe Rawit Merah','VEG-008',70000,112000,u_veg,u_kg);
  PERFORM public.upsert_product('Daun Bawang','VEG-009',15000,24000,u_veg,u_kg);
  PERFORM public.upsert_product('Daun Kunyit','ING-001',45000,72000,u_ing,u_kg);
  PERFORM public.upsert_product('Daun Jeruk','ING-002',44000,70400,u_ing,u_kg);
  PERFORM public.upsert_product('Daun Kemangi','ING-003',17000,27200,u_ing,u_kg);
  PERFORM public.upsert_product('Daun Pisang','ING-004',10000,16000,u_ing,u_kg);
  PERFORM public.upsert_product('Daun Salam','ING-005',15000,24000,u_ing,u_kg);
  PERFORM public.upsert_product('Daun Seledri','ING-006',33000,52800,u_ing,u_kg);
  PERFORM public.upsert_product('Daun Singkong','VEG-010',15000,24000,u_veg,u_kg);
  PERFORM public.upsert_product('Sawi Hijau','VEG-011',12000,19200,u_veg,u_kg);
  PERFORM public.upsert_product('Sawi Putih','VEG-012',14000,22400,u_veg,u_kg);
  PERFORM public.upsert_product('Ubi Kayu','VEG-013',12000,19200,u_veg,u_kg);
  PERFORM public.upsert_product('Ubi Rambat','VEG-014',15000,24000,u_veg,u_kg);
  PERFORM public.upsert_product('Jagung Manis','VEG-015',19000,30400,u_veg,u_kg);
  PERFORM public.upsert_product('Jagung Putren','VEG-016',25000,40000,u_veg,u_kg);
  PERFORM public.upsert_product('Kacang Panjang','VEG-017',15000,24000,u_veg,u_kg);
  PERFORM public.upsert_product('Kangkung','VEG-018',15000,24000,u_veg,u_kg);
  PERFORM public.upsert_product('Pare','VEG-019',15000,24000,u_veg,u_kg);
  PERFORM public.upsert_product('Kentang','VEG-020',17500,28000,u_veg,u_kg);
  PERFORM public.upsert_product('Labu Siam','VEG-021',16000,26500,u_veg,u_kg);
  PERFORM public.upsert_product('Kembang Kol','VEG-022',18500,29600,u_veg,u_kg);
  PERFORM public.upsert_product('Brocoli','VEG-023',25000,40000,u_veg,u_kg);
  PERFORM public.upsert_product('Daun Selada','VEG-024',18000,28800,u_veg,u_kg);
  PERFORM public.upsert_product('Kol','VEG-025',8500,13600,u_veg,u_kg);
  PERFORM public.upsert_product('Bayam','VEG-026',14000,22400,u_veg,u_kg);
  PERFORM public.upsert_product('Buncis','VEG-027',27000,43200,u_veg,u_kg);
  PERFORM public.upsert_product('Nangka Kupas Potong','VEG-028',20000,32000,u_veg,u_kg);
  PERFORM public.upsert_product('Poyong/Gambas','VEG-029',25000,40000,u_veg,u_kg);
  PERFORM public.upsert_product('Pak Coy','VEG-030',15000,24000,u_veg,u_kg);
  PERFORM public.upsert_product('Terong Ungu','VEG-031',15000,24000,u_veg,u_kg);
  PERFORM public.upsert_product('Timun','VEG-032',9000,14400,u_veg,u_kg);
  PERFORM public.upsert_product('Tomat','VEG-033',9500,15200,u_veg,u_kg);
  PERFORM public.upsert_product('Wortel','VEG-034',14500,23200,u_veg,u_kg);
  PERFORM public.upsert_product('Toge','VEG-035',11500,18400,u_veg,u_kg);
  PERFORM public.upsert_product('Kemiri','ING-007',49000,78400,u_ing,u_kg);
  PERFORM public.upsert_product('Serai','ING-008',21000,33600,u_ing,u_kg);
  PERFORM public.upsert_product('Kunyit','ING-009',14000,22400,u_ing,u_kg);
  PERFORM public.upsert_product('Kencur','ING-010',44000,70400,u_ing,u_kg);
  PERFORM public.upsert_product('Jahe','ING-011',23500,37600,u_ing,u_kg);
  PERFORM public.upsert_product('Jeruk Nipis','VEG-036',25000,40000,u_veg,u_kg);
  PERFORM public.upsert_product('Tahu','ING-012',6500,10400,u_ing,u_pcs);
  PERFORM public.upsert_product('Tempe','ING-013',7000,11200,u_ing,u_pcs);
  -- Supplier items
  PERFORM public.upsert_product('Asin Cumi Telur','SEA-008',120000,192000,u_sea,u_kg);
  PERFORM public.upsert_product('Jambal Roti','SEA-009',180000,288000,u_sea,u_kg);
  PERFORM public.upsert_product('Jengkol','VEG-037',30000,48000,u_veg,u_kg);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Deactivate old AI-generated stub products
-- ============================================================
UPDATE public.products
SET active = false
WHERE organization_id = 'a4ae3325-7073-4a64-bd7c-045d591f5e29'
  AND sku LIKE 'PRD%';
