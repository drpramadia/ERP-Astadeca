-- Migration: 055_grant_master_data_to_admin.sql
--
-- Problem: role ADMIN could not create or edit any master data, and the
-- "Data Master" navigation item was hidden for those users.
--
-- Two independent gates both require the permission `admin.master_data`:
--   1. Navigation: app-shell.tsx marks the Data Master item with
--      permission: "admin.master_data", so the link is not rendered without it.
--   2. Row Level Security: every master data table's write policy is
--      `*_manage` ALL USING has_org_permission(organization_id, 'admin.master_data')
--      — products, product_categories, units, customers, suppliers,
--      warehouses, cold_storages, storage_locations, business_units.
--
-- Role ADMIN was seeded with 21 permissions but `admin.master_data` was not
-- among them (only DIRECTOR, SUPER_USER and SYSTEM held it), so all writes were
-- rejected by RLS and the page could not be reached from the menu.
--
-- Verified before the fix by impersonating the affected user
-- (adm.astadeca@gmail.com, profiles.full_name = 'Gian', org role ADMIN) through
-- request.jwt.claims:
--     has_org_permission(org, 'admin.master_data') = false
--     has_org_permission(org, 'admin.users')       = true
--
-- Date: 2026-09-29

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
  AND p.code = 'admin.master_data'
ON CONFLICT (role_id, permission_id) DO NOTHING;
