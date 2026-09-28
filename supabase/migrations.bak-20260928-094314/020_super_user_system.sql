-- Migration: 020_super_user_system.sql
-- Super User System for ASTADECA BASWARA PERSADA
-- Date: 2026-09-26
-- Safe: IDEMPOTENT

-- ============================================================
-- STEP 1: Schema changes
-- ============================================================

-- Profiles: add system_role column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='system_role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN system_role VARCHAR(20);
  END IF;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Invitations table
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id),
  role_id UUID REFERENCES public.roles(id),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  invited_by UUID REFERENCES public.profiles(id),
  invitation_token UUID DEFAULT gen_random_uuid(),
  status VARCHAR(20) DEFAULT 'PENDING',
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_select ON public.invitations FOR SELECT USING (true);
CREATE POLICY invitations_insert ON public.invitations FOR INSERT WITH CHECK (true);

-- System audit log
CREATE TABLE IF NOT EXISTS public.system_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action VARCHAR(50) NOT NULL,
  target_user_id UUID REFERENCES public.profiles(id),
  target_email VARCHAR(255),
  organization_id UUID REFERENCES public.organizations(id),
  actor_user_id UUID REFERENCES public.profiles(id),
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_audit_select ON public.system_audit_log FOR SELECT USING (true);
CREATE POLICY system_audit_insert ON public.system_audit_log FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_system_audit_actor ON public.system_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_system_audit_target ON public.system_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_system_audit_org ON public.system_audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_system_audit_action ON public.system_audit_log(action);

-- ============================================================
-- STEP 2: Core is_super_user function (no dependencies)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_super_user(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND system_role = 'SUPER_USER'
    );
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND system_role = 'SUPER_USER'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- STEP 3: is_org_member_by_id (helper, no deps)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_member_by_id(p_user_id UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = p_user_id AND organization_id = p_org_id AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- STEP 4: grant_super_user (uses is_super_user)
-- ============================================================

CREATE OR REPLACE FUNCTION public.grant_super_user(
  p_target_user_id UUID,
  p_granted_by UUID
)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.is_super_user(p_granted_by) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: SUPER_USER only');
  END IF;
  IF p_target_user_id = p_granted_by THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot grant to yourself');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  UPDATE public.profiles SET system_role = 'SUPER_USER' WHERE id = p_target_user_id;

  INSERT INTO public.system_audit_log (action, target_user_id, actor_user_id, new_value)
  VALUES ('SUPER_USER_GRANTED', p_target_user_id, p_granted_by, '{"system_role": "SUPER_USER"}'::jsonb);

  RETURN jsonb_build_object('success', true, 'message', 'SUPER_USER granted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STEP 5: revoke_super_user (uses is_super_user)
-- ============================================================

CREATE OR REPLACE FUNCTION public.revoke_super_user(
  p_target_user_id UUID,
  p_revoked_by UUID
)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.is_super_user(p_revoked_by) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: SUPER_USER only');
  END IF;
  IF p_target_user_id = p_revoked_by THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot revoke yourself');
  END IF;

  UPDATE public.profiles SET system_role = NULL WHERE id = p_target_user_id;

  INSERT INTO public.system_audit_log (action, target_user_id, actor_user_id, old_value)
  VALUES ('SUPER_USER_REVOKED', p_target_user_id, p_revoked_by, '{"system_role": null}'::jsonb);

  RETURN jsonb_build_object('success', true, 'message', 'SUPER_USER revoked');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STEP 6: update_user_role
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_user_role(
  p_user_id UUID,
  p_role_id UUID,
  p_org_id UUID,
  p_updated_by UUID
)
RETURNS JSONB AS $$
DECLARE
  v_old_role_id UUID;
  v_old_code TEXT;
  v_new_code TEXT;
BEGIN
  IF NOT (public.is_super_user(p_updated_by) OR
         (public.is_org_director(p_org_id) AND public.is_org_member_by_id(p_updated_by, p_org_id))) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  SELECT role_id INTO v_old_role_id
  FROM public.organization_memberships
  WHERE user_id = p_user_id AND organization_id = p_org_id;

  SELECT code INTO v_old_code FROM public.roles WHERE id = v_old_role_id;
  SELECT code INTO v_new_code FROM public.roles WHERE id = p_role_id;

  UPDATE public.organization_memberships SET role_id = p_role_id
  WHERE user_id = p_user_id AND organization_id = p_org_id;

  INSERT INTO public.system_audit_log (action, target_user_id, organization_id, actor_user_id, old_value, new_value)
  VALUES (
    'ROLE_CHANGED', p_user_id, p_org_id, p_updated_by,
    jsonb_build_object('role_id', COALESCE(v_old_role_id::text, ''), 'role_code', COALESCE(v_old_code, '')),
    jsonb_build_object('role_id', p_role_id::text, 'role_code', COALESCE(v_new_code, ''))
  );

  RETURN jsonb_build_object('success', true, 'message', 'Role updated');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STEP 7: toggle_membership
-- ============================================================

CREATE OR REPLACE FUNCTION public.toggle_membership(
  p_user_id UUID,
  p_org_id UUID,
  p_active BOOLEAN,
  p_toggled_by UUID
)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.is_super_user(p_toggled_by) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;
  IF p_user_id = p_toggled_by THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot toggle yourself');
  END IF;

  UPDATE public.organization_memberships SET is_active = p_active
  WHERE user_id = p_user_id AND organization_id = p_org_id;

  INSERT INTO public.system_audit_log (action, target_user_id, organization_id, actor_user_id, new_value)
  VALUES (
    CASE WHEN p_active THEN 'USER_ACTIVATED' ELSE 'USER_DEACTIVATED' END,
    p_user_id, p_org_id, p_toggled_by,
    jsonb_build_object('is_active', p_active)
  );

  RETURN jsonb_build_object('success', true, 'message',
    CASE WHEN p_active THEN 'User activated' ELSE 'User deactivated' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STEP 8: invite_user
-- ============================================================

CREATE OR REPLACE FUNCTION public.invite_user(
  p_organization_id UUID,
  p_role_id UUID,
  p_email VARCHAR,
  p_full_name VARCHAR,
  p_invited_by UUID
)
RETURNS JSONB AS $$
BEGIN
  IF NOT public.is_super_user(p_invited_by) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF EXISTS (SELECT 1 FROM public.invitations WHERE email = p_email AND status = 'PENDING') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pending invitation exists');
  END IF;

  INSERT INTO public.invitations (organization_id, role_id, email, full_name, invited_by)
  VALUES (p_organization_id, p_role_id, p_email, p_full_name, p_invited_by);

  INSERT INTO public.system_audit_log (action, target_email, organization_id, actor_user_id, new_value)
  VALUES ('USER_INVITED', p_email, p_organization_id, p_invited_by,
    jsonb_build_object('email', p_email, 'role_id', p_role_id::text));

  RETURN jsonb_build_object('success', true, 'message', 'Invitation created');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STEP 9: Accept invitation (for future use)
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_inv RECORD;
BEGIN
  SELECT * INTO v_inv FROM public.invitations
  WHERE invitation_token = p_token AND status = 'PENDING' AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid or expired invitation');
  END IF;

  -- Create profile if not exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    INSERT INTO public.profiles (id, full_name) VALUES (p_user_id, v_inv.full_name);
  END IF;

  -- Create membership
  INSERT INTO public.organization_memberships (user_id, organization_id, role_id, is_active)
  VALUES (p_user_id, v_inv.organization_id, v_inv.role_id, true)
  ON CONFLICT (user_id, organization_id) DO UPDATE SET role_id = v_inv.role_id, is_active = true;

  -- Mark invitation as accepted
  UPDATE public.invitations SET status = 'ACCEPTED', accepted_at = NOW()
  WHERE id = v_inv.id;

  INSERT INTO public.system_audit_log (action, target_user_id, organization_id, new_value)
  VALUES ('USER_ACCEPTED_INVITATION', p_user_id, v_inv.organization_id,
    jsonb_build_object('email', v_inv.email));

  RETURN jsonb_build_object('success', true, 'message', 'Invitation accepted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- STEP 10: RLS policies
-- ============================================================

CREATE POLICY profiles_system_update ON public.profiles FOR UPDATE USING (
  CASE
    WHEN auth.uid() = id AND
         EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND system_role = 'SUPER_USER')
    THEN false  -- Cannot change own system_role
    WHEN public.is_super_user(auth.uid()) THEN true
    ELSE true
  END
);

-- ============================================================
-- STEP 11: Initialize SUPER_USER for diraprama1@gmail.com
-- ============================================================

DO $$
DECLARE
  v_auth_id UUID;
BEGIN
  SELECT au.id INTO v_auth_id FROM auth.users au WHERE au.email = 'diraprama1@gmail.com';

  IF v_auth_id IS NULL THEN
    RAISE NOTICE 'Auth user diraprama1@gmail.com not found yet';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_auth_id) THEN
    UPDATE public.profiles SET system_role = 'SUPER_USER' WHERE id = v_auth_id;
    RAISE NOTICE 'SUPER_USER set for diraprama1@gmail.com';
  ELSE
    RAISE NOTICE 'Profile for diraprama1@gmail.com not found - user must sign in first to create profile';
  END IF;
END $$;
