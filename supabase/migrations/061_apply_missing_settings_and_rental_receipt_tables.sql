-- Migration: 061_apply_missing_settings_and_rental_receipt_tables.sql
--
-- Two tables the UI has always queried did not exist in the database, so their
-- pages failed to load (PGRST205 "Could not find the table ... in the schema
-- cache"). Both had a migration written but never applied:
--
--   * public.organization_settings  (013_organization_settings.sql) - read by
--     /settings. Re-declared here with guarded policies so it can be applied
--     on top of a database where 013 never ran.
--   * public.rental_goods_receipts  - no migration existed at all. The rental
--     receiving screen probes this table to choose between its two write paths
--     and needs it for the dedicated path.
--
-- Date: 2026-09-29

-- ============================================================
-- 1. Organization settings (from 013, idempotent)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organization_settings (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  setting_key text NOT NULL CHECK (setting_key IN ('TAX_PERCENTAGE', 'CURRENCY')),
  setting_value jsonb NOT NULL,
  updated_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, setting_key)
);

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_settings_select ON public.organization_settings;
CREATE POLICY organization_settings_select
  ON public.organization_settings FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS organization_settings_insert ON public.organization_settings;
CREATE POLICY organization_settings_insert
  ON public.organization_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_org_permission(organization_id, 'admin.settings'));

DROP POLICY IF EXISTS organization_settings_update ON public.organization_settings;
CREATE POLICY organization_settings_update
  ON public.organization_settings FOR UPDATE TO authenticated
  USING (public.has_org_permission(organization_id, 'admin.settings'))
  WITH CHECK (public.has_org_permission(organization_id, 'admin.settings'));

CREATE OR REPLACE FUNCTION public.set_organization_setting(
  p_organization_id uuid,
  p_setting_key text,
  p_setting_value jsonb,
  p_actor_user_id uuid DEFAULT auth.uid()
)
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

-- Defaults, so the settings screen shows the company values rather than blanks.
INSERT INTO public.organization_settings (organization_id, setting_key, setting_value)
SELECT o.id, 'TAX_PERCENTAGE', '11'::jsonb FROM public.organizations o
ON CONFLICT (organization_id, setting_key) DO NOTHING;

INSERT INTO public.organization_settings (organization_id, setting_key, setting_value)
SELECT o.id, 'CURRENCY', '"IDR"'::jsonb FROM public.organizations o
ON CONFLICT (organization_id, setting_key) DO NOTHING;

-- ============================================================
-- 2. Rental goods receipts (headers + lines)
--    Columns match the payload the rental receiving screen already builds.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rental_goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.rental_contracts(id) ON DELETE SET NULL,
  reference_number text,
  status text NOT NULL DEFAULT 'RECEIVED',
  notes text,
  received_by uuid REFERENCES public.profiles(id),
  received_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rental_goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.rental_goods_receipts(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  batch_number text,
  qty_kg numeric(14,3) NOT NULL DEFAULT 0,
  production_date date,
  expiry_date date,
  bin_location text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rental_goods_receipts_org_idx
  ON public.rental_goods_receipts (organization_id);
CREATE INDEX IF NOT EXISTS rental_goods_receipt_items_receipt_idx
  ON public.rental_goods_receipt_items (receipt_id);

ALTER TABLE public.rental_goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_goods_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_goods_receipts_select ON public.rental_goods_receipts;
CREATE POLICY rental_goods_receipts_select
  ON public.rental_goods_receipts FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS rental_goods_receipts_write ON public.rental_goods_receipts;
CREATE POLICY rental_goods_receipts_write
  ON public.rental_goods_receipts FOR ALL TO authenticated
  USING (public.has_org_permission(organization_id, 'rental.receive'))
  WITH CHECK (public.has_org_permission(organization_id, 'rental.receive'));

DROP POLICY IF EXISTS rental_goods_receipt_items_select ON public.rental_goods_receipt_items;
CREATE POLICY rental_goods_receipt_items_select
  ON public.rental_goods_receipt_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rental_goods_receipts r
    WHERE r.id = rental_goods_receipt_items.receipt_id
      AND public.is_org_member(r.organization_id)
  ));

DROP POLICY IF EXISTS rental_goods_receipt_items_write ON public.rental_goods_receipt_items;
CREATE POLICY rental_goods_receipt_items_write
  ON public.rental_goods_receipt_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rental_goods_receipts r
    WHERE r.id = rental_goods_receipt_items.receipt_id
      AND public.has_org_permission(r.organization_id, 'rental.receive')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rental_goods_receipts r
    WHERE r.id = rental_goods_receipt_items.receipt_id
      AND public.has_org_permission(r.organization_id, 'rental.receive')
  ));
