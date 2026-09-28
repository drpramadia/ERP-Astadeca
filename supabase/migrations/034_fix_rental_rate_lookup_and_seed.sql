-- Migration: 034_fix_rental_rate_lookup_and_seed.sql
-- Makes "barang masuk" (goods-in) work on the rental side.
--
-- Two separate defects, both proven against the live database:
--
-- 1. get_applicable_rental_rate() priority 4 joined the products table on
--    p.product_category_id, but products has no such column (it is category_id).
--    Any call reaching priority 4 aborted the whole function with
--      column p.product_category_id does not exist
--    which receive_rental_stock() surfaces as a generic failure — every rental
--    goods-in attempt failed at the rate lookup.
--
-- 2. No rental rate ever existed: rental_rates was empty, so even with a fixed
--    lookup there is no rate for the fallback priority 6 to return and
--    receive_rental_stock() raised 'No applicable rental rate found'.
--    The only seed attempt, 008_activation_seed.sql, calls create_rental_rate()
--    positionally with 13 arguments:
--      create_rental_rate(org, 'CUSTOMER', customer, storage, NULL, NULL, NULL,
--                         100, 0, CURRENT_DATE, NULL, 'notes', actor)
--    but the deployed signature is
--      (p_organization_id, p_rate_type, p_rate_per_kg_day, p_effective_from,
--       p_performed_by, p_customer_id, ...)
--    so the call raises 42883 (function does not exist) and the seed silently
--    died. This migration therefore seeds a rate by NAME, not by position.
--
-- Date: 2026-09-28

-- ---------------------------------------------------------------------------
-- 1. Repair the product-category rate lookup.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_applicable_rental_rate(
  p_organization_id uuid,
  p_customer_id uuid,
  p_product_id uuid,
  p_cold_storage_id uuid,
  p_storage_location_id uuid,
  p_effective_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  rate_id uuid,
  rate_type text,
  rate_per_kg_day numeric,
  discount_percentage numeric,
  effective_rate_per_kg_day numeric
)
LANGUAGE plpgsql
STABLE
AS $function$
BEGIN
  -- Priority 1: Customer-specific rate
  RETURN QUERY
  SELECT rr.id, rr.rate_type, rr.rate_per_kg_day, rr.discount_percentage,
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) AS effective_rate
  FROM public.rental_rates rr
  WHERE rr.organization_id = p_organization_id
    AND rr.customer_id = p_customer_id
    AND rr.status = 'ACTIVE'
    AND rr.effective_from <= p_effective_date
    AND (rr.effective_to IS NULL OR rr.effective_to >= p_effective_date)
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Priority 2: Cold storage specific rate
  RETURN QUERY
  SELECT rr.id, rr.rate_type, rr.rate_per_kg_day, rr.discount_percentage,
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) AS effective_rate
  FROM public.rental_rates rr
  WHERE rr.organization_id = p_organization_id
    AND rr.cold_storage_id = p_cold_storage_id
    AND rr.customer_id IS NULL
    AND rr.status = 'ACTIVE'
    AND rr.effective_from <= p_effective_date
    AND (rr.effective_to IS NULL OR rr.effective_to >= p_effective_date)
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Priority 3: Storage location specific rate
  RETURN QUERY
  SELECT rr.id, rr.rate_type, rr.rate_per_kg_day, rr.discount_percentage,
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) AS effective_rate
  FROM public.rental_rates rr
  WHERE rr.organization_id = p_organization_id
    AND rr.storage_location_id = p_storage_location_id
    AND rr.customer_id IS NULL
    AND rr.status = 'ACTIVE'
    AND rr.effective_from <= p_effective_date
    AND (rr.effective_to IS NULL OR rr.effective_to >= p_effective_date)
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Priority 4: Product category rate.
  -- products exposes the category as category_id (there is no
  -- product_category_id column); rental_rates.product_category_id references
  -- product_categories(id).
  RETURN QUERY
  SELECT rr.id, rr.rate_type, rr.rate_per_kg_day, rr.discount_percentage,
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) AS effective_rate
  FROM public.rental_rates rr
  JOIN public.products p ON p.category_id = rr.product_category_id
  WHERE rr.organization_id = p_organization_id
    AND rr.product_category_id IS NOT NULL
    AND p.id = p_product_id
    AND rr.customer_id IS NULL
    AND rr.status = 'ACTIVE'
    AND rr.effective_from <= p_effective_date
    AND (rr.effective_to IS NULL OR rr.effective_to >= p_effective_date)
  ORDER BY rr.effective_from DESC
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Priority 5: Product specific rate
  RETURN QUERY
  SELECT rr.id, rr.rate_type, rr.rate_per_kg_day, rr.discount_percentage,
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) AS effective_rate
  FROM public.rental_rates rr
  WHERE rr.organization_id = p_organization_id
    AND rr.product_id = p_product_id
    AND rr.customer_id IS NULL
    AND rr.status = 'ACTIVE'
    AND rr.effective_from <= p_effective_date
    AND (rr.effective_to IS NULL OR rr.effective_to >= p_effective_date)
  LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Priority 6: Standard rate (fallback)
  RETURN QUERY
  SELECT rr.id, rr.rate_type, rr.rate_per_kg_day, rr.discount_percentage,
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) AS effective_rate
  FROM public.rental_rates rr
  WHERE rr.organization_id = p_organization_id
    AND rr.rate_type = 'STANDARD'
    AND rr.customer_id IS NULL
    AND rr.cold_storage_id IS NULL
    AND rr.storage_location_id IS NULL
    AND rr.product_id IS NULL
    AND rr.product_category_id IS NULL
    AND rr.status = 'ACTIVE'
    AND rr.effective_from <= p_effective_date
    AND (rr.effective_to IS NULL OR rr.effective_to >= p_effective_date)
  ORDER BY rr.effective_from DESC
  LIMIT 1;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Seed the fallback standard rate for every organization that lacks one.
--    Idempotent: skips organizations that already have an active standard rate.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_org record;
  v_actor uuid;
  v_has_standard boolean;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.rental_rates rr
      WHERE rr.organization_id = v_org.id
        AND rr.rate_type = 'STANDARD'
        AND rr.customer_id IS NULL
        AND rr.cold_storage_id IS NULL
        AND rr.storage_location_id IS NULL
        AND rr.product_id IS NULL
        AND rr.product_category_id IS NULL
        AND rr.status = 'ACTIVE'
        AND rr.effective_from <= CURRENT_DATE
        AND (rr.effective_to IS NULL OR rr.effective_to >= CURRENT_DATE)
    ) INTO v_has_standard;

    CONTINUE WHEN v_has_standard;

    -- Attribute the rate to an active director, else any active member.
    SELECT om.user_id INTO v_actor
    FROM public.organization_memberships om
    JOIN public.roles r ON r.id = om.role_id
    WHERE om.organization_id = v_org.id
      AND om.is_active
      AND r.code = 'DIRECTOR'
    LIMIT 1;

    IF v_actor IS NULL THEN
      SELECT om.user_id INTO v_actor
      FROM public.organization_memberships om
      WHERE om.organization_id = v_org.id AND om.is_active
      LIMIT 1;
    END IF;

    CONTINUE WHEN v_actor IS NULL;

    -- Named arguments: the positional form used by 008 does not resolve.
    BEGIN
      PERFORM public.create_rental_rate(
        p_organization_id => v_org.id,
        p_rate_type => 'STANDARD',
        p_rate_per_kg_day => 100,
        p_effective_from => CURRENT_DATE,
        p_performed_by => v_actor,
        p_notes => 'Fallback standard rental rate: IDR 100 per KG per day'
      );
      RAISE NOTICE 'Seeded STANDARD rental rate for organization %', v_org.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not seed standard rental rate for organization %: %', v_org.id, SQLERRM;
    END;
  END LOOP;
END
$$;
