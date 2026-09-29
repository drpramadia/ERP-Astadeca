-- Migration: 051_fix_super_user_role_and_owner_membership.sql
-- Bug 1: role SUPER_USER was seeded with only 1 of 39 permissions
--        (rental.billing). has_org_permission() has a dedicated
--        SUPER_USER full-access bypass branch, so the role MUST be
--        seeded completely for the permission matrix to be coherent.
-- Bug 2: the organization owner's membership carried role SYSTEM
--        (view-only, 12 permissions, no rental.manage), so every
--        management button gated by has_org_permission(...) was hidden
--        — e.g. "+ Buat Kontrak" on /rental/contracts.
--
-- Date: 2026-09-29

-- ============================================================
-- 1. Seed role SUPER_USER with every permission
-- ============================================================
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'SUPER_USER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- 2. Promote the organization owner's membership to SUPER_USER
-- ============================================================
UPDATE public.organization_memberships m
SET role_id = r_super.id
FROM public.roles r_super
WHERE r_super.code = 'SUPER_USER'
  AND m.user_id = (SELECT id FROM auth.users WHERE email = 'diraprama1@gmail.com')
  AND m.role_id IS DISTINCT FROM r_super.id;
