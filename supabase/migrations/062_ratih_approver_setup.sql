-- Migration: 062_ratih_approver_setup.sql
--
-- Create organization membership for Ratih Cynthia Dewi (APPROVER/DIRECTOR)
-- User auth account: ratih.cinthia@gmail.com
-- Role: DIRECTOR (has approval.approve permission)
--
-- Date: 2026-09-30

-- Get Ratih's user ID from auth.users
DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role_id uuid;
BEGIN
  -- Find Ratih's user ID
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'ratih.cinthia@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User ratih.cinthia@gmail.com not found in auth.users - will be created manually';
  ELSE
    -- Get ASTADECA organization
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE code = 'ASTADECA'
    LIMIT 1;

    -- Get DIRECTOR role
    SELECT id INTO v_role_id
    FROM public.roles
    WHERE code = 'DIRECTOR'
    LIMIT 1;

    -- Create or update membership
    INSERT INTO public.organization_memberships (user_id, organization_id, role_id, is_active)
    VALUES (v_user_id, v_org_id, v_role_id, true)
    ON CONFLICT (user_id, organization_id) DO UPDATE
      SET role_id = v_role_id, is_active = true, updated_at = now();

    RAISE NOTICE 'Ratih assigned as DIRECTOR for ASTADECA';
  END IF;
END;
$$ LANGUAGE plpgsql;
