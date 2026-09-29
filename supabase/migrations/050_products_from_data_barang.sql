-- Insert products from data barang.jpeg (HARGA DAGING AYAM 21 SEP - 1 OKT 2026)
-- Names only — no prices (NULL), category Chicken, unit KG
INSERT INTO public.products (id, organization_id, category_id, unit_id, sku, name, track_batch, track_expiry, active)
VALUES
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-010','Ayam Karkas Kecil (0.9kg)',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-011','Ayam Karkas 1KG up',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-012','Dada Utuh/Parting',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-013','Paha Atas',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-014','Paha Bawah',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-015','Kulit',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-016','Minced',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-017','MDM',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-018','Hati',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-019','Ampela Bersih',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-020','Cincang Dada',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-021','Cincang Paha',true,true,true),
  (gen_random_uuid(),'a4ae3325-7073-4a64-bd7c-045d591f5e29','069bc52a-a254-4f73-91a5-1f7f699ef617','b089b260-bd8f-4a08-a72b-ae2c6375fb34','AYAM-022','Ayam Kampung Super',true,true,true)
ON CONFLICT (organization_id, sku) DO NOTHING;
