-- Migration: 057_grant_operational_permissions_and_new_users.sql
--
-- 1) Gian (adm.astadeca@gmail.com, org role ADMIN, system_role SUPER_USER) could
--    not perform the operational work he is responsible for. The ADMIN role was
--    seeded with only the `.view` side of purchasing, sales and finance, so:
--      * "PO Baru" and the purchasing actions failed,
--      * the sales/PO approval actions were unavailable,
--      * /finance/payments was unreachable (nav gate is finance.payment),
--      * stock adjustments were blocked (inventory.adjust),
--      * the rental contract/rate maintenance items were hidden.
--    ADMIN is granted every permission except approval.approve, so the approval
--    step stays with DIRECTOR (approval_steps.approver_role_id = 'DIRECTOR') —
--    the separation that lets Gian submit and Ratih decide is preserved.
--
-- 2) Memberships for the two newly created accounts. The on_auth_user_created
--    trigger (handle_new_user) populates public.profiles from the account
--    metadata but does not create an organization membership, so it is created
--    here with the intended role:
--      * Syaiful Gustiana - WAREHOUSE (warehouse and cold storage activity)
--      * SISWOKO         - QC        (quality control)
--
-- Date: 2026-09-29

-- ============================================================
-- 1. ADMIN: full operational permissions, minus approval.approve
-- ============================================================
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
  AND p.code <> 'approval.approve'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- 2. Memberships for the new accounts
-- ============================================================
INSERT INTO public.organization_memberships (user_id, organization_id, role_id, is_active)
SELECT u.id, o.id, r.id, true
FROM auth.users u
CROSS JOIN public.organizations o
JOIN public.roles r ON r.code = 'WAREHOUSE'
WHERE u.email = 'syaifulgustiana@gmail.com'
ON CONFLICT (user_id, organization_id) DO UPDATE
  SET role_id = EXCLUDED.role_id,
      is_active = true,
      updated_at = now();

INSERT INTO public.organization_memberships (user_id, organization_id, role_id, is_active)
SELECT u.id, o.id, r.id, true
FROM auth.users u
CROSS JOIN public.organizations o
JOIN public.roles r ON r.code = 'QC'
WHERE u.email = 'siswoko2705@gmail.com'
ON CONFLICT (user_id, organization_id) DO UPDATE
  SET role_id = EXCLUDED.role_id,
      is_active = true,
      updated_at = now();
