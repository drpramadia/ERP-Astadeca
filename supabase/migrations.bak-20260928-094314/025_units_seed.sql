-- Migration: 025_units_seed.sql
-- Units seed data with correct org_id
-- Date: 2026-09-27

INSERT INTO public.units (id, organization_id, code, name, description, active) VALUES
  ('11111111-1111-1111-1111-000000000001', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'KG', 'Kilogram', 'Unit berat standar', true),
  ('11111111-1111-1111-1111-000000000002', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'EKOR', 'Ekor', 'Unit untuk ikan utuh', true),
  ('11111111-1111-1111-1111-000000000003', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'BOX', 'Karton', 'Unit kemasan kardus', true),
  ('11111111-1111-1111-1111-000000000004', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'PACK', 'Pack', 'Unit kemasan pack', true)
ON CONFLICT (id) DO NOTHING;

-- Product categories seed
INSERT INTO public.product_categories (id, organization_id, code, name, description, active) VALUES
  ('22222222-2222-2222-2222-000000000001', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CAT001', 'Daging Segar', 'Kategori daging segar', true),
  ('22222222-2222-2222-2222-000000000002', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CAT002', 'Seafood', 'Kategori seafood', true),
  ('22222222-2222-2222-2222-000000000003', 'a4ae3325-7073-4a64-bd7c-045d591f5e29', 'CAT003', 'Frozen Food', 'Kategori frozen food', true)
ON CONFLICT (id) DO NOTHING;
