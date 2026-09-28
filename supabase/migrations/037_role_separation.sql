-- Migration: 037_role_separation.sql
-- Separate SUPER_USER (platform administrator) from DIRECTOR (business authority),
-- and close two privilege-escalation holes in the profiles policies.
--
-- Part A - role separation
-- ------------------------
-- Two independent axes were tangled together:
--   1. profiles.system_role = 'SUPER_USER'  (system level, platform administration)
--   2. organization_memberships.role_id     (business level, org authority)
--
-- `has_org_permission()` hardcoded a DIRECTOR bypass that
--   - masked six permission codes that policies reference but that were never seeded
--   - made DIRECTOR indistinguishable from SUPER_USER at the RLS layer
--
-- After this migration:
--   READ  is gated by `is_org_member`      (53 policies) -> any active member reads.
--   WRITE is gated by `has_org_permission` (47 policies) -> explicit grant only.
--
-- Zero SELECT policies sit behind `has_org_permission`, so removing the DIRECTOR
-- bypass leaves read access untouched and narrows write access to explicit
-- holders. DIRECTOR keeps every row of access it has today, because all six codes
-- it was implicitly relying on are seeded and granted below.
--
-- SUPER_USER therefore becomes: full read for support/audit, zero business write.
-- Business approval stays with DIRECTOR alone.
--
-- Part B - privilege escalation (found while auditing the above)
-- -------------------------------------------------------------
-- `profiles_system_update` ended in `ELSE true` with no WITH CHECK, so ANY
-- authenticated user could UPDATE ANY profile - including setting the
-- `system_role` column. Verified empirically: a user with system_role = NULL
-- self-promoted to 'SUPER_USER' with a single UPDATE.
--
-- The fix is a guard trigger rather than a policy rewrite, because RLS cannot
-- compare OLD and NEW. Normal profile edits stay open to the row owner;
-- only `system_role` is locked down, and only to the SECURITY DEFINER RPCs
-- grant_super_user / revoke_super_user.
--
-- Date: 2026-09-28
-- Idempotent: safe to re-run.

-- ============================================================
-- PHASE 1: SYSTEM role
-- ============================================================
DO $$
DECLARE
    v_id uuid;
BEGIN
    SELECT id INTO v_id FROM public.roles WHERE code = 'SYSTEM' LIMIT 1;

    IF v_id IS NULL THEN
        INSERT INTO public.roles (code, name, description, is_system)
        VALUES (
            'SYSTEM',
            'System Administrator',
            'Platform administrator. Full read for support and audit; no business write authority; cannot approve business documents.',
            true
        );
        RAISE NOTICE 'PHASE 1: SYSTEM role created';
    ELSE
        RAISE NOTICE 'PHASE 1: SYSTEM role already present';
    END IF;
END $$;

-- ============================================================
-- PHASE 2: Seed the six permission codes referenced by RLS but never created
-- ============================================================
INSERT INTO public.permissions (code, name, module) VALUES
    ('documents.manage',  'Manage Documents',           'documents'),
    ('documents.create',  'Create Documents',           'documents'),
    ('inventory.manage',  'Manage Inventory',           'inventory'),
    ('rental.manage',     'Manage Cold Storage Rental', 'rental'),
    ('rental.release',    'Release Rental Stock',       'rental'),
    ('approval.approve',  'Approve Requests',           'approval')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- PHASE 3: Grant those codes to the roles that depended on the bypass.
-- Runs BEFORE the bypass is removed, so no role loses access.
-- ============================================================

-- DIRECTOR relied on the bypass for exactly these six codes.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'DIRECTOR'
  AND p.code IN (
      'documents.manage', 'documents.create', 'inventory.manage',
      'rental.manage', 'rental.release', 'approval.approve'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ADMIN keeps the document and rental write access it had via the bypass.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
  AND p.code IN (
      'documents.manage', 'documents.create', 'inventory.manage',
      'rental.manage', 'rental.release'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- SYSTEM gets administration permissions only. Deliberately excludes every
-- business write code (inventory.*, rental.*, purchase.*, sales.*,
-- approval.approve) so a platform admin cannot transact on business data.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'SYSTEM'
  AND p.code IN ('admin.users', 'admin.settings', 'admin.master_data')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================
-- PHASE 4: has_org_permission - drop the DIRECTOR bypass.
-- Write access now needs an explicit grant, for every role alike.
-- Read access is unaffected: no SELECT policy calls this function.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_org_permission(p_org_id uuid, p_permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  select exists (
    select 1
    from public.organization_memberships om
    join public.roles r
      on r.id = om.role_id
    join public.role_permissions rp
      on rp.role_id = r.id
    join public.permissions p
      on p.id = rp.permission_id
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.is_active = true
      and p.code = p_permission_code
  );
$$;

-- ============================================================
-- PHASE 5: notify_org_permission_holders - drop the DIRECTOR bypass.
-- Recipients are the holders of the named permission plus SYSTEM members,
-- who need system-level events.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_org_permission_holders(
    p_organization_id uuid,
    p_permission_code text,
    p_sender_user_id uuid DEFAULT NULL,
    p_type character varying DEFAULT 'INFO',
    p_title text DEFAULT NULL,
    p_message text DEFAULT NULL,
    p_link text DEFAULT NULL,
    p_entity_type character varying DEFAULT NULL,
    p_entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_recipient RECORD;
BEGIN
    FOR v_recipient IN
        SELECT DISTINCT om.user_id
        FROM public.organization_memberships om
        JOIN public.roles r ON r.id = om.role_id
        WHERE om.organization_id = p_organization_id
          AND om.is_active = true
          AND om.user_id IS DISTINCT FROM p_sender_user_id
          AND (
              r.code = 'SYSTEM'
              OR EXISTS (
                  SELECT 1
                  FROM public.role_permissions rp
                  JOIN public.permissions p ON p.id = rp.permission_id
                  WHERE rp.role_id = r.id
                    AND p.code = p_permission_code
              )
          )
    LOOP
        PERFORM public.send_notification(
            p_organization_id, v_recipient.user_id, p_sender_user_id,
            p_type, p_title, p_message, p_link, p_entity_type, p_entity_id
        );
    END LOOP;
END;
$$;

-- ============================================================
-- PHASE 6: profiles read access for administrators.
-- The only SELECT policy is `id = auth.uid()`, so the user-management screen
-- renders every colleague's name as null.
-- ============================================================
DROP POLICY IF EXISTS profiles_admin_read ON public.profiles;
DROP POLICY IF EXISTS profiles_self_or_admin_read ON public.profiles;

CREATE POLICY profiles_self_or_admin_read ON public.profiles
FOR SELECT USING (
    -- own row
    id = auth.uid()
    -- any active org-level administrator may read the directory
    OR EXISTS (
        SELECT 1
        FROM public.organization_memberships om
        JOIN public.roles r ON r.id = om.role_id
        WHERE om.user_id = auth.uid()
          AND om.is_active = true
          AND r.code IN ('SYSTEM', 'ADMIN', 'DIRECTOR')
    )
);

-- ============================================================
-- PHASE 7: Privilege-escalation guard on profiles.system_role.
-- RLS cannot compare OLD and NEW, so a trigger enforces it.
--
-- SECURITY INVOKER on purpose: inside a SECURITY DEFINER function
-- `current_user` is always the owner, so the check below would never fire.
-- As an invoker, `current_user` reflects the actual executor --
-- 'authenticated' for app traffic, 'postgres' for migrations and for the
-- SECURITY DEFINER RPCs grant_super_user / revoke_super_user.
-- ============================================================
CREATE OR REPLACE FUNCTION public.profiles_guard_system_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
    -- Only act when system_role actually changes.
    IF NEW.system_role IS NOT DISTINCT FROM OLD.system_role THEN
        RETURN NEW;
    END IF;

    -- Trusted paths: the SECURITY DEFINER RPCs, migrations and service role.
    IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'Changing profiles.system_role requires the grant_super_user or revoke_super_user function'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_system_role ON public.profiles;
CREATE TRIGGER profiles_guard_system_role
BEFORE UPDATE OF system_role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_system_role();

-- The original `profiles_system_update` ended in `ELSE true` with no WITH CHECK,
-- letting any authenticated user update any profile. Restrict UPDATE to the row
-- owner or an active administrator. system_role is handled by the guard trigger.
DROP POLICY IF EXISTS profiles_system_update ON public.profiles;
DROP POLICY IF EXISTS profiles_self_or_admin_update ON public.profiles;

CREATE POLICY profiles_self_or_admin_update ON public.profiles
FOR UPDATE
USING (
    id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.organization_memberships om
        JOIN public.roles r ON r.id = om.role_id
        WHERE om.user_id = auth.uid()
          AND om.is_active = true
          AND r.code IN ('SYSTEM', 'ADMIN', 'DIRECTOR')
    )
)
WITH CHECK (
    id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.organization_memberships om
        JOIN public.roles r ON r.id = om.role_id
        WHERE om.user_id = auth.uid()
          AND om.is_active = true
          AND r.code IN ('SYSTEM', 'ADMIN', 'DIRECTOR')
    )
);

-- ============================================================
-- PHASE 8: Move the sole account off DIRECTOR.
-- organization_memberships is UNIQUE (user_id, organization_id), so a user
-- holds exactly one business role per organization. SUPER_USER is represented
-- by the SYSTEM role, not by stacking a second membership.
-- ============================================================
DO $$
DECLARE
    v_user_id      uuid;
    v_org_id       uuid;
    v_system_id    uuid;
    v_current_code text := NULL;
    v_final_code   text := NULL;
BEGIN
    SELECT id INTO v_user_id
    FROM public.profiles
    WHERE id = 'b5718c75-8054-45ff-a889-5bd671004260'
       OR full_name = 'Dio Pramdia'
    ORDER BY (id = 'b5718c75-8054-45ff-a889-5bd671004260') DESC
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'PHASE 8: target profile not found - skipping';
        RETURN;
    END IF;

    -- Resolve the organization from the user's own active membership rather
    -- than by a hardcoded code: the seeded organization row is 'MAIN', not
    -- 'ASTADECA' as 008_activation_seed intended, because the row already
    -- existed when that seed ran.
    SELECT organization_id INTO v_org_id
    FROM public.organization_memberships
    WHERE user_id = v_user_id
      AND is_active = true
    ORDER BY created_at
    LIMIT 1;

    IF v_org_id IS NULL THEN
        RAISE NOTICE 'PHASE 8: no active membership found - skipping';
        RETURN;
    END IF;

    SELECT id INTO v_system_id FROM public.roles WHERE code = 'SYSTEM' LIMIT 1;

    SELECT r.code INTO v_current_code
    FROM public.organization_memberships om
    JOIN public.roles r ON r.id = om.role_id
    WHERE om.user_id = v_user_id
      AND om.organization_id = v_org_id
    LIMIT 1;

    IF v_current_code IS NULL THEN
        INSERT INTO public.organization_memberships (user_id, organization_id, role_id, is_active)
        VALUES (v_user_id, v_org_id, v_system_id, true);
        RAISE NOTICE 'PHASE 8: membership created with SYSTEM role';
    ELSIF v_current_code = 'SYSTEM' THEN
        RAISE NOTICE 'PHASE 8: membership already SYSTEM - nothing to do';
    ELSE
        UPDATE public.organization_memberships
        SET role_id = v_system_id
        WHERE user_id = v_user_id
          AND organization_id = v_org_id;

        RAISE NOTICE 'PHASE 8: role changed % -> SYSTEM', v_current_code;
    END IF;

    SELECT r.code INTO v_final_code
    FROM public.organization_memberships om
    JOIN public.roles r ON r.id = om.role_id
    WHERE om.user_id = v_user_id
      AND om.organization_id = v_org_id
    LIMIT 1;

    RAISE NOTICE 'PHASE 8: final business role = %', v_final_code;
    RAISE NOTICE 'PHASE 8: system role = %',
        (SELECT system_role FROM public.profiles WHERE id = v_user_id);
END $$;

-- ============================================================
-- PHASE 9: Verify the two axes are now independent
-- ============================================================
DO $$
DECLARE
    v_user_id uuid;
    v_org_id  uuid;
    v_biz     text;
    v_count   int;
BEGIN
    SELECT id INTO v_user_id FROM public.profiles
    WHERE id = 'b5718c75-8054-45ff-a889-5bd671004260' LIMIT 1;

    SELECT organization_id INTO v_org_id
    FROM public.organization_memberships
    WHERE user_id = v_user_id AND is_active = true
    ORDER BY created_at
    LIMIT 1;

    SELECT r.code INTO v_biz
    FROM public.organization_memberships om
    JOIN public.roles r ON r.id = om.role_id
    WHERE om.user_id = v_user_id AND om.organization_id = v_org_id
    LIMIT 1;

    RAISE NOTICE '=== VERIFICATION ===';
    RAISE NOTICE 'system_role   : %', (SELECT system_role FROM public.profiles WHERE id = v_user_id);
    RAISE NOTICE 'business role : %', v_biz;

    SELECT COUNT(*) INTO v_count FROM public.role_permissions rp
    JOIN public.roles ro ON ro.id = rp.role_id WHERE ro.code = 'SYSTEM';
    RAISE NOTICE 'SYSTEM grants : % (admin only)', v_count;

    SELECT COUNT(*) INTO v_count FROM public.role_permissions rp
    JOIN public.roles ro ON ro.id = rp.role_id WHERE ro.code = 'DIRECTOR';
    RAISE NOTICE 'DIRECTOR grants: %', v_count;

    SELECT COUNT(*) INTO v_count FROM public.organization_memberships om
    JOIN public.roles ro ON ro.id = om.role_id
    WHERE ro.code = 'DIRECTOR' AND om.is_active = true;
    RAISE NOTICE 'active DIRECTORs: %', v_count;

    RAISE NOTICE 'system_role guard trigger: %',
        (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'profiles_guard_system_role');
END $$;
