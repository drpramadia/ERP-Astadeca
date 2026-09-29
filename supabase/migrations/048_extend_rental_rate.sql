-- Migration: 048_extend_rental_rate.sql
-- Adds minimum_quantity_kg and minimum_days columns to rental_rates table
-- and extends create_rental_rate RPC to accept them.
-- Date: 2026-09-29

-- ============================================================
-- 1. Add columns to rental_rates
-- ============================================================
ALTER TABLE public.rental_rates
  ADD COLUMN IF NOT EXISTS minimum_quantity_kg numeric(14,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_days integer DEFAULT 0;

-- ============================================================
-- 2. Drop and recreate create_rental_rate with new params
--    (CREATE OR REPLACE does not allow adding params with defaults
--    in a way that keeps callers compatible, so we DROP + CREATE)
-- ============================================================
DROP FUNCTION IF EXISTS public.create_rental_rate(
  uuid, text, numeric, date, uuid,
  uuid, uuid, uuid, uuid, uuid,
  numeric, date, text
);

CREATE FUNCTION public.create_rental_rate(
  p_organization_id         uuid,
  p_rate_type               text,
  p_rate_per_kg_day         numeric,
  p_effective_from          date,
  p_performed_by            uuid,
  p_customer_id             uuid  DEFAULT NULL,
  p_cold_storage_id        uuid  DEFAULT NULL,
  p_storage_location_id     uuid  DEFAULT NULL,
  p_product_category_id    uuid  DEFAULT NULL,
  p_product_id              uuid  DEFAULT NULL,
  p_discount_percentage     numeric DEFAULT 0,
  p_effective_to           date  DEFAULT NULL,
  p_notes                  text  DEFAULT NULL,
  -- NEW params (default to 0 so old callers still work)
  p_minimum_quantity_kg     numeric DEFAULT 0,
  p_minimum_days           integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_rate_id uuid;
  v_is_director boolean;
BEGIN
  -- Validation
  IF p_rate_per_kg_day < 0 THEN
    RAISE EXCEPTION 'Rate cannot be negative.';
  END IF;

  IF p_discount_percentage > 10 THEN
    SELECT public.is_org_director(p_performed_by, p_organization_id) INTO v_is_director;
    IF NOT v_is_director THEN
      RAISE EXCEPTION 'Diskon di atas 10%% memerlukan persetujuan Director.';
    END IF;
  END IF;

  INSERT INTO public.rental_rates (
    organization_id, rate_number, rate_type,
    customer_id, cold_storage_id, storage_location_id,
    product_category_id, product_id,
    rate_per_kg_day, discount_percentage,
    minimum_quantity_kg, minimum_days,
    effective_from, effective_to,
    notes, status, created_by
  ) VALUES (
    p_organization_id,
    public.generate_rate_number(p_organization_id),
    p_rate_type,
    p_customer_id, p_cold_storage_id, p_storage_location_id,
    p_product_category_id, p_product_id,
    p_rate_per_kg_day, p_discount_percentage,
    COALESCE(p_minimum_quantity_kg, 0),
    COALESCE(p_minimum_days, 0),
    p_effective_from, p_effective_to,
    p_notes, 'ACTIVE', p_performed_by
  )
  RETURNING id INTO v_rate_id;

  -- Audit log
  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by,
    'RENTAL_RATE_CREATED', 'rental_rate', v_rate_id,
    jsonb_build_object(
      'rate_type', p_rate_type,
      'rate_per_kg_day', p_rate_per_kg_day,
      'discount_percentage', p_discount_percentage,
      'minimum_quantity_kg', p_minimum_quantity_kg,
      'minimum_days', p_minimum_days
    )
  );

  RETURN v_rate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_rental_rate(
  uuid, text, numeric, date, uuid,
  uuid, uuid, uuid, uuid, uuid,
  numeric, date, text,
  numeric, integer
) TO authenticated;
