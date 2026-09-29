-- Migration: 058_activate_warehouse_qc_rental_receive.sql
--
-- Three gaps found by cross-checking every RLS policy that calls
-- has_org_permission() against the role_permissions matrix.
--
-- 1) `rental.receive` was required but never existed.
--    rental_allocations_insert is guarded by
--        has_org_permission(organization_id, 'rental.receive')
--    but no such row existed in public.permissions (only ten rental.* codes
--    did, and rental.receive was not one of them). A permission code that is
--    not in the table cannot be held by any role, so placing stock into a cold
--    storage (the rental receiving flow) failed for every role except
--    SUPER_USER, which passes has_org_permission through its bypass branch.
--    The permission is created here and granted to the roles that actually
--    receive rental goods.
--
-- 2) QC could not perform quality control.
--    qc_inspections INSERT/UPDATE/DELETE and receiving_items/receiving_records
--    writes all require `inventory.receive`, which the QC role did not hold
--    (its 9 permissions were dashboard/documents/inventory.adjust/inventory.view/
--    purchase.view/rental.manage/rental.view/reports.view). The QC user
--    (SISWOKO) could therefore only read the inspection list. Granted now.
--
-- 3) WAREHOUSE could not release rental stock.
--    rental_allocations_update requires `rental.release`; WAREHOUSE holds
--    rental.manage and rental.view but not rental.release, so releasing
--    (pelepasan barang) was blocked for the role whose job it is.
--
-- Date: 2026-09-29

-- ============================================================
-- 1. Create the missing permission
-- ============================================================
INSERT INTO public.permissions (code, name, module, description)
VALUES ('rental.receive', 'Receive Rental Stock', 'rental',
        'Record rental goods received into cold storage (rental_allocations).')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. Grant it to the roles that receive, place and release rental stock
-- ============================================================
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE p.code = 'rental.receive'
  AND r.code IN ('ADMIN', 'WAREHOUSE', 'DIRECTOR', 'SUPER_USER')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- 3. QC: write access to inspections (the policy uses inventory.receive)
-- ============================================================
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'QC'
  AND p.code IN ('inventory.receive')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- 4. WAREHOUSE: release rental stock (pelepasan barang)
-- ============================================================
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'WAREHOUSE'
  AND p.code IN ('rental.release')
ON CONFLICT (role_id, permission_id) DO NOTHING;
