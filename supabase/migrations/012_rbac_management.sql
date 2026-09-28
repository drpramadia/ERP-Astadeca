CREATE OR REPLACE FUNCTION public.manage_organization_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_role_id uuid,
  p_is_active boolean,
  p_actor_user_id uuid DEFAULT auth.uid()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_member public.organization_memberships%ROWTYPE;
  v_role_code text;
  v_old_role_code text;
  v_active_directors integer;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Actor does not match the authenticated user';
  END IF;
  IF NOT public.has_org_permission(p_organization_id, 'admin.users') THEN
    RAISE EXCEPTION 'Missing admin.users permission';
  END IF;
  IF p_user_id = p_actor_user_id AND p_is_active = false THEN
    RAISE EXCEPTION 'You cannot deactivate your own membership';
  END IF;

  SELECT * INTO v_member
  FROM public.organization_memberships
  WHERE organization_id = p_organization_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization membership not found';
  END IF;

  SELECT code INTO v_role_code FROM public.roles WHERE id = p_role_id;
  IF v_role_code IS NULL THEN
    RAISE EXCEPTION 'Requested role not found';
  END IF;
  SELECT code INTO v_old_role_code FROM public.roles WHERE id = v_member.role_id;

  IF v_role_code = 'DIRECTOR' AND NOT public.is_org_director(p_actor_user_id, p_organization_id) THEN
    RAISE EXCEPTION 'Only a Director may assign the Director role';
  END IF;

  IF v_old_role_code = 'DIRECTOR' AND (v_role_code <> 'DIRECTOR' OR NOT p_is_active) THEN
    SELECT count(*) INTO v_active_directors
    FROM public.organization_memberships membership
    JOIN public.roles role_record ON role_record.id = membership.role_id
    WHERE membership.organization_id = p_organization_id
      AND membership.is_active = true
      AND role_record.code = 'DIRECTOR';
    IF v_active_directors <= 1 THEN
      RAISE EXCEPTION 'The only active Director cannot be deactivated or demoted';
    END IF;
  END IF;

  UPDATE public.organization_memberships
  SET role_id = p_role_id,
      is_active = p_is_active,
      updated_at = now()
  WHERE id = v_member.id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_organization_id, p_actor_user_id, 'ORGANIZATION_MEMBER_UPDATED',
    'organization_membership', v_member.id,
    jsonb_build_object('user_id', p_user_id, 'role', v_old_role_code, 'is_active', v_member.is_active),
    jsonb_build_object('user_id', p_user_id, 'role', v_role_code, 'is_active', p_is_active)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_organization_member(uuid, uuid, uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_organization_member(uuid, uuid, uuid, boolean, uuid) TO authenticated;