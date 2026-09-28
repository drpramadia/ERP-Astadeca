-- =====================================================
-- Migration: 023_seed_idempotent.sql
-- Idempotent seed data for warehouse system
-- Safe to re-run multiple times
-- =====================================================

-- 1. PRODUCT CATEGORIES
INSERT INTO product_categories (id, organization_id, code, name, description) VALUES
    ('cf42405a-a552-1a5e-902e-738bc766dc8f', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CAT001', 'Daging Segar', 'Kategori daging segar'),
    ('f93de256-6bad-b703-b967-61e8167c12ce', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CAT002', 'Seafood', 'Kategori seafood segar'),
    ('562fe9f4-0b3d-72cd-cefc-829101d66d36', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CAT003', 'Frozen Food', 'Kategori makanan beku')
ON CONFLICT (organization_id, code) DO NOTHING;

-- 2. UNITS
INSERT INTO units (id, organization_id, code, name, description) VALUES
    ('1035f3a8-974b-4b67-a887-f623dda849c3', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'UNIT001', 'Kilogram', 'Satuan berat 1 kg'),
    ('06c9ffb5-bd08-864a-0ef4-0309fe37bd5c', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'UNIT002', 'Ekor', 'Satuan per ekor'),
    ('2f235189-d4c2-b78f-a35c-82c4cbd154d4', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'UNIT003', 'Karton', 'Satuan per karton/box'),
    ('4ba752a9-6512-c366-ccd6-f3ea69c930e0', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'UNIT004', 'Packs', 'Satuan per pack')
ON CONFLICT (organization_id, code) DO NOTHING;

-- 3. SUPPLIERS
INSERT INTO suppliers (id, organization_id, code, name, contact_person, phone, email, address) VALUES
    ('3d02c491-ac96-ea0a-f286-06292c17343a', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'SUP001', 'PT Sumber Daging Nusantara', 'Budi Santoso', '081234567001', 'budi@sumberdaging.co.id', 'Jl. Raya Surabaya No. 1'),
    ('9444f301-c724-eae5-fcb5-3c7d46814efb', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'SUP002', 'CV Peternakan Jaya', 'Joko Wibowo', '081234567002', 'joko@peternakanjaya.id', 'Jl. Ternak Sentosa No. 5'),
    ('456662c5-cbda-b94c-8b1e-e1c029eaf041', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'SUP003', 'UD Fresh Meat Indonesia', 'Siti Aminah', '081234567003', 'siti@freshmeat.id', 'Jl. Pasar Baru No. 10'),
    ('aba6db6e-74d1-4c7e-2e11-49ca89aa9f9e', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'SUP004', 'PT Laut Selatan Seafood', 'Ahmad Fauzi', '081234567004', 'ahmad@lautselatan.id', 'Jl. Pelni No. 25'),
    ('70db8dbc-d55b-6d8c-e17e-0c86319acdd5', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'SUP005', 'UD Agro Frozen Indonesia', 'Dewi Lestari', '081234567005', 'dewi@agrofrozen.id', 'Jl. Industri No. 8')
ON CONFLICT (organization_id, code) DO NOTHING;

-- 4. CUSTOMERS
INSERT INTO customers (id, organization_id, code, name, contact_person, phone, email, address) VALUES
    ('17df4856-2040-e79d-5bed-857171f2aa52', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CUS001', 'PT Maju Pangan', 'Rudi Hermawan', '081298765001', 'rudi@majupangan.co.id', 'Jl. Sudirman No. 100'),
    ('d041b229-26e3-0ae8-1328-93c0fe0b1c1e', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CUS002', 'CV Restoran Bahari', 'Pak Hendra', '081298765002', 'hendra@restoranbahari.id', 'Jl. Laut No. 15'),
    ('c90cb9cd-20b5-500f-0c6b-5f5ab62e5f99', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CUS003', 'UD Catering Enak', 'Bu Ratna', '081298765003', 'ratna@cateringenak.id', 'Jl. Meal No. 30'),
    ('4fa64cf7-eb55-272a-50b9-29411bfe35b8', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CUS004', 'PT Hotel Bintang Timur', 'Pak Agus', '081298765004', 'agus@hoteltimur.co.id', 'Jl. Bintang No. 50'),
    ('337f8999-ee19-8860-2bb0-962bf38a323f', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CUS005', 'CV Supermarket Segar', 'Ibu Lina', '081298765005', 'lina@supermarketsegar.id', 'Jl. Swalayan No. 7')
ON CONFLICT (organization_id, code) DO NOTHING;

-- 5. PRODUCTS (using sku instead of code, with required defaults)
INSERT INTO products (id, organization_id, name, category_id, unit_id, sku, description, purchase_price, selling_price, min_stock, track_batch, track_expiry, active) VALUES
    ('af234c53-79ae-d8ec-a777-d02470415634', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Daging Ayam Fillet', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD001', 'Daging ayam fillet segar berkualitas tinggi', 0, 0, 0, false, false, true),
    ('267df40b-a2ae-fc0b-206a-67081e7eca7f', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Daging Sapi Has Dalam', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD002', 'Daging sapi has dalam tanpa tulang', 0, 0, 0, false, false, true),
    ('ab71bfcd-3df9-573a-6b7a-0d884d2bfc17', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Daging Sapi Has Luar', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD003', 'Daging sapi has luar dengan sedikit lemak', 0, 0, 0, false, false, true),
    ('d007012e-64dc-fa6e-d5ac-f6245aaa583c', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Ikan Dori Fillet', 'f93de256-6bad-b703-b967-61e8167c12ce', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD004', 'Ikan dori fillet segar', 0, 0, 0, false, false, true),
    ('8a0035cc-da03-48e3-ecad-b5a820255616', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Udang Vannamei', 'f93de256-6bad-b703-b967-61e8167c12ce', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD005', 'Udang vannamei segar', 0, 0, 0, false, false, true),
    ('15407999-43af-58bf-6101-2588a22e665e', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Daging Ayam Utuh', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD006', 'Daging ayam utuh segar', 0, 0, 0, false, false, true),
    ('227b6357-9e1d-58db-b84e-271f98629a74', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Daging Sapi Iga', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD007', 'Daging sapi iga dengan tulang', 0, 0, 0, false, false, true),
    ('0127ec4d-ba93-9d01-1e9e-0a45da4672e5', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Ikan Salmon', 'f93de256-6bad-b703-b967-61e8167c12ce', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD008', 'Ikan salmon segar impor', 0, 0, 0, false, false, true),
    ('b2b2b1c1-8a02-2735-d424-6c3e865c0b80', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Udang Tiger', 'f93de256-6bad-b703-b967-61e8167c12ce', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD009', 'Udang tiger besar segar', 0, 0, 0, false, false, true),
    ('7402f78e-c5fc-af92-ff51-3d648560e381', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Daging Ayam Paha', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD010', 'Daging ayam paha bawah', 0, 0, 0, false, false, true),
    ('1beb5fd0-28f8-1605-c108-9c7096607c41', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Daging Sapi Tenderloin', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD011', 'Daging sapi tenderloin premium', 0, 0, 0, false, false, true),
    ('8b3244bf-1760-1c2d-a134-27a25ffc3756', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Ikan Tongkol', 'f93de256-6bad-b703-b967-61e8167c12ce', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD012', 'Ikan tongkol segar lokal', 0, 0, 0, false, false, true),
    ('61b080dd-4b05-6d08-e3f6-cf6560843589', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Chicken Wings', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD013', 'Chicken wings segar', 0, 0, 0, false, false, true),
    ('a71a3057-19ed-b81c-11d4-eb6f3dbbe490', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Chicken Drumstick', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD014', 'Chicken drumstick segar', 0, 0, 0, false, false, true),
    ('b5674da5-4728-5ac3-64a7-838d810cb6dc', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'Daging Kambing', 'cf42405a-a552-1a5e-902e-738bc766dc8f', '1035f3a8-974b-4b67-a887-f623dda849c3', 'PRD015', 'Daging kambing segar', 0, 0, 0, false, false, true)
ON CONFLICT (organization_id, sku) DO NOTHING;
