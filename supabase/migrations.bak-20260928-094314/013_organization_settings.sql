CREATE TABLE IF NOT EXISTS public.organization_settings (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  setting_key text NOT NULL CHECK (setting_key IN ('TAX_PERCENTAGE', 'CURRENCY')),
  setting_value jsonb NOT NULL,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, setting_key)
);

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_settings_select
  ON public.organization_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE POLICY organization_settings_insert
  ON public.organization_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_org_permission(organization_id, 'admin.settings'));

CREATE POLICY organization_settings_update
  ON public.organization_settings FOR UPDATE TO authenticated
  USING (public.has_org_permission(organization_id, 'admin.settings'))
  WITH CHECK (public.has_org_permission(organization_id, 'admin.settings'));

CREATE OR REPLACE FUNCTION public.set_organization_setting(
  p_organization_id uuid,
  p_setting_key text,
  p_setting_value jsonb,
  p_actor_user_id uuid DEFAULT auth.uid()
RETURNS public.organization_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_saved public.organization_settings%ROWTYPE;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Actor does not match the authenticated user';
  END IF;
  IF NOT public.has_org_permission(p_organization_id, 'admin.settings') THEN
    RAISE EXCEPTION 'Missing admin.settings permission';
  END IF;
  IF p_setting_key NOT IN ('TAX_PERCENTAGE', 'CURRENCY') THEN
    RAISE EXCEPTION 'Unsupported organization setting';
  END IF;
  IF p_setting_key = 'TAX_PERCENTAGE' AND (
    jsonb_typeof(p_setting_value) <> 'number'
    OR (p_setting_value #>> '{}')::numeric < 0
    OR (p_setting_value #>> '{}')::numeric > 100
  ) THEN
    RAISE EXCEPTION 'Tax percentage must be between 0 and 100';
  END IF;
  IF p_setting_key = 'CURRENCY' AND p_setting_value #>> '{}' NOT IN ('IDR', 'USD', 'SGD', 'EUR') THEN
    RAISE EXCEPTION 'Unsupported currency';
  END IF;

  INSERT INTO public.organization_settings (organization_id, setting_key, setting_value, updated_by, updated_at)
  VALUES (p_organization_id, p_setting_key, p_setting_value, p_actor_user_id, now())
  ON CONFLICT (organization_id, setting_key) DO UPDATE
  SET setting_value = EXCLUDED.setting_value,
      updated_by = EXCLUDED.updated_by,
      updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_saved;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_actor_user_id, 'ORGANIZATION_SETTING_UPDATED',
    'organization_setting', NULL,
    jsonb_build_object('setting_key', p_setting_key, 'setting_value', p_setting_value)
  );

  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.set_organization_setting(uuid, text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_organization_setting(uuid, text, jsonb, uuid) TO authenticated;