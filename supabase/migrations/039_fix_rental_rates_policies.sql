-- ============================================================================
-- 039 | Fix rental_rates RLS policies — permission code mismatch
-- ============================================================================
--
-- Migration 037 seeded permission codes as `rental.manage` (single dot), but the
-- RLS policies on rental_rates were written as `rental.rate.manage` (double dot).
-- has_org_permission() looks up the exact string, so the mismatch means INSERT and
-- UPDATE are permanently denied for every user including DIRECTOR.
--
-- This migration corrects both policies to use the canonical codes that actually
-- exist in the permissions table.
-- ============================================================================

-- Verify the mismatch before fixing
DO $$
DECLARE
  v_code TEXT;
BEGIN
  -- Check: does rental.rate.manage exist (the wrong name)?
  SELECT code INTO v_code FROM public.permissions WHERE code = 'rental.rate.manage';
  IF v_code IS NOT NULL THEN
    RAISE NOTICE 'rental.rate.manage EXISTS — no fix needed (unexpected state)';
  ELSE
    RAISE NOTICE 'rental.rate.manage NOT FOUND — policies need correction';
  END IF;

  -- Check: does rental.manage exist (the correct name)?
  SELECT code INTO v_code FROM public.permissions WHERE code = 'rental.manage';
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'rental.manage does not exist — cannot fix policies';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Fix only the UPDATE policy.
--
-- INSERT goes through the SECURITY DEFINER RPC `create_rental_rate()`, which
-- bypasses RLS entirely — the INSERT policy is never consulted for that path.
-- We fix it anyway for consistency so direct-INSERT remains possible for admins.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rental_rates_insert ON public.rental_rates;

CREATE POLICY rental_rates_insert ON public.rental_rates
  FOR INSERT
  WITH CHECK (public.has_org_permission(organization_id, 'rental.manage'));

DROP POLICY IF EXISTS rental_rates_update ON public.rental_rates;

CREATE POLICY rental_rates_update ON public.rental_rates
  FOR UPDATE
  USING (public.has_org_permission(organization_id, 'rental.manage'))
  WITH CHECK (public.has_org_permission(organization_id, 'rental.manage'));

-- ---------------------------------------------------------------------------
-- Grant EXECUTE to authenticated (policies still gate access)
-- ---------------------------------------------------------------------------
GRANT INSERT, SELECT, UPDATE ON public.rental_rates TO authenticated;
