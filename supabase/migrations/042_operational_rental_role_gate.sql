-- Migration: 042_operational_rental_role_gate.sql
-- Adds rental permissions to WAREHOUSE & QC (they work in Cold Storage /rental/*).
-- Creates operational.view as the gate for /dashboard and operational routes.
-- Renames ADMIN role to "Admin Nota & Invoice".
--
-- Gate logic in proxy.ts:
--   - role has rental.* + operational.* → /system-pick (dual access)
--   - role has only rental.* → Cold Storage only, redirect /dashboard → /rental
--   - role has only operational.* → Operational only, redirect /rental → /dashboard
--
-- Role matrix after this migration:
--   WAREHOUSE   → rental only  → /rental
--   QC         → rental only  → /rental
--   ADMIN      → dual system  → /system-pick
--   DIRECTOR   → dual system  → /system-pick
--   PURCHASING / SALES / FINANCE / DELIVERY → operational only → /dashboard
-- Date: 2026-09-29

-- ============================================================
-- 1. Seed operational.view permission
-- ============================================================
INSERT INTO public.permissions (code, name, module)
VALUES ('operational.view', 'Access Operational System', 'operational')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. Rename ADMIN role to "Admin Nota & Invoice"
-- ============================================================
UPDATE public.roles
SET name = 'Admin Nota & Invoice'
WHERE code = 'ADMIN';

-- ============================================================
-- 3. Grant rental permissions to WAREHOUSE & QC
-- ============================================================
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('WAREHOUSE', 'QC')
  AND p.code IN ('rental.view', 'rental.manage')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. Grant operational.view to roles that have inventory/purchase/sales
--    (they get to see the Operational system)
-- ============================================================
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('PURCHASING', 'SALES', 'FINANCE', 'DELIVERY', 'ADMIN', 'DIRECTOR')
  AND p.code = 'operational.view'
ON CONFLICT DO NOTHING;
