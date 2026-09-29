-- Migration: 045_rental_billing_auto_calculate.sql
-- RPC to auto-calculate billing from active_quantity_kg × rate × days
-- Billing = SUM(kg × rate_per_kg_day × days_in_period) per contract
-- Date: 2026-09-29

CREATE OR REPLACE FUNCTION public.calculate_rental_billing(
  p_contract_id uuid,
  p_period_start date,
  p_period_end   date
)
RETURNS TABLE (
  contract_id          uuid,
  period_start         date,
  period_end           date,
  total_quantity_kg    numeric,
  total_days           integer,
  rate_per_kg_day     numeric,
  total_charge         numeric,
  currency             text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_rate numeric(14,4);
  v_total_kg numeric(14,3);
  v_days integer;
  v_currency text := 'IDR';
BEGIN
  -- Get rate from rental_rates (STANDARD fallback)
  SELECT COALESCE(
    (SELECT r.rate_per_kg_day FROM public.rental_rates r
     WHERE r.organization_id = (
       SELECT organization_id FROM public.rental_contracts WHERE id = p_contract_id
     )
     AND r.rate_type = 'STANDARD' AND r.status = 'ACTIVE'
     AND (r.effective_from IS NULL OR r.effective_from <= p_period_end)
     ORDER BY r.effective_from DESC LIMIT 1),
    0
  ) INTO v_rate;

  -- Get total active kg from allocations (using actual current weight)
  SELECT COALESCE(SUM(ra.active_quantity_kg), 0)
  INTO v_total_kg
  FROM public.rental_allocations ra
  WHERE ra.contract_id = p_contract_id
    AND ra.status IN ('ACTIVE', 'PARTIALLY_RELEASED');

  -- Days in period
  SELECT EXTRACT(DAYS FROM (p_period_end - p_period_start)) + 1 INTO v_days;

  RETURN QUERY SELECT
    p_contract_id,
    p_period_start,
    p_period_end,
    v_total_kg,
    v_days,
    v_rate,
    ROUND((v_total_kg * v_rate * v_days)::numeric, 2),
    v_currency;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_rental_billing(uuid, date, date) TO authenticated;
