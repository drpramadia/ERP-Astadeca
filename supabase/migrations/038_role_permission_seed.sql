-- ============================================================================
-- 038 | Role permission seeding + effective-permission lookup
-- ============================================================================
--
-- Two problems this closes.
--
-- First: six of the nine org roles carry ZERO permissions. WAREHOUSE, SALES,
-- QC, PURCHASING, DELIVERY and FINANCE were created by the original seed but
-- never wired to permission rows, so any user assigned to them could log in
-- and see an empty shell. The Roles settings page would show them as valid
-- choices while granting nothing.
--
-- Second: role SYSTEM (the org-role used by SUPER_USER) held only three
-- permissions, all of them admin.*. SUPER_USER is meant to be a full-read
-- audit identity with no business write, but without dashboard.view or any
-- *.view code it could not actually reach a single module. Migration 037
-- documented that intent; this migration makes it true.
--
-- The permission grant is expressed as data (a VALUES map) rather than six
-- hand-written INSERT blocks so the intent stays legible and a future role
-- is one row away.
--
-- Read-only for business writes is deliberate: SYSTEM intentionally omits
-- inventory.receive, inventory.issue, rental.manage, *.create and *.approve.
-- Those belong to the operating roles.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Effective permissions for the calling user.
--
-- The UI needs this to decide which nav entries to render. Reading it from
-- role_permissions directly in the browser is not possible: role_permissions
-- is not exposed to the authenticated role, and a client-side join would leak
-- the whole matrix. This returns only the caller's own codes.
--
-- STABLE + SECURITY DEFINER so it can read the permission tables while still
-- filtering on auth.uid(), which resolves from the caller's JWT — not from
-- any argument, so a caller cannot ask for someone else's permissions.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_my_permissions();

CREATE FUNCTION public.get_my_permissions()
RETURNS TABLE (permission_code text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT (
      SELECT m.role_id
      FROM public.organization_memberships m
      WHERE m.user_id = auth.uid() AND m.is_active = true
      LIMIT 1
    ) AS role_id
  )
  SELECT DISTINCT p.code
  FROM public.permissions p, me
  WHERE p.id IN (
    SELECT rp.permission_id
    FROM public.role_permissions rp
    WHERE rp.role_id = me.role_id
  );
$$;

REVOKE ALL ON FUNCTION public.get_my_permissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. Seed the permission matrix.
--
-- Codes that do not exist are skipped rather than failing the migration, so
-- this stays safe if the permission catalogue changes later.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_role_code text;
  v_codes     text[];
  v_matrix    text[][] := ARRAY[
    ARRAY['WAREHOUSE',  'dashboard.view,inventory.view,inventory.receive,inventory.issue,inventory.transfer,inventory.adjust,inventory.opname,inventory.manage,purchase.view,documents.view,documents.print,reports.view'],
    ARRAY['PURCHASING', 'dashboard.view,purchase.view,purchase.create,purchase.approve,inventory.view,documents.view,documents.print,documents.create,reports.view'],
    ARRAY['QC',         'dashboard.view,inventory.view,inventory.adjust,purchase.view,documents.view,documents.print,reports.view'],
    ARRAY['SALES',      'dashboard.view,sales.view,sales.create,sales.approve,rental.view,rental.create,rental.manage,inventory.view,documents.view,documents.print,documents.create,reports.view'],
    ARRAY['FINANCE',    'dashboard.view,finance.view,finance.payment,finance.approve,rental.view,rental.billing,documents.view,documents.print,reports.view'],
    ARRAY['DELIVERY',   'dashboard.view,inventory.view,inventory.issue,documents.view,documents.print,reports.view'],
    ARRAY['SYSTEM',     'dashboard.view,admin.master_data,admin.settings,admin.users,documents.view,documents.print,inventory.view,purchase.view,sales.view,rental.view,finance.view,reports.view']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(v_matrix, 1)
  LOOP
    v_role_code := v_matrix[i][1];
    v_codes     := string_to_array(v_matrix[i][2], ',');

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM public.roles r
    JOIN public.permissions p ON p.code = ANY (v_codes)
    WHERE r.code = v_role_code
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Verification — fail loudly rather than reporting success blindly.
--
-- A silent DO block that matched no rows is the failure mode this guards
-- against: without the check, a typo in a role code would leave the role
-- empty and the migration would still exit 0.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_empty text;
BEGIN
  SELECT string_agg(r.code, ', ' ORDER BY r.code)
  INTO v_empty
  FROM public.roles r
  LEFT JOIN public.role_permissions rp ON rp.role_id = r.id
  WHERE r.code <> 'DIRECTOR'
  GROUP BY r.code
  HAVING count(rp.permission_id) = 0;

  IF v_empty IS NOT NULL THEN
    RAISE EXCEPTION 'Roles still without permissions: %', v_empty;
  END IF;
END $$;
