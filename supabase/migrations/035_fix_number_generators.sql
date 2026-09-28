-- Migration: 035_fix_number_generators.sql
-- Repairs five document-number generators whose sequence extraction reads the
-- wrong slice of the existing number, so they fail (or silently repeat) as soon
-- as a second row exists.
--
-- Root cause: each generator parses its own number with a hard-coded character
-- window, e.g.
--   CAST(SUBSTRING(rc.contract_number FROM 5 FOR 4) AS int)
-- The numbers are built as <prefix>-<YY>-<seq>, so for 'CNT-26-0001' the window
-- 5..8 lands on '26-0' and the cast raises
--   ERROR: 22P02: invalid input syntax for type integer: "26-0"
--
-- Why the first document always worked: when the table has no matching row the
-- aggregate sees zero rows, the expression is never evaluated, and COALESCE
-- yields 1. From the second document onward the parse runs and fails.
--
-- Impact found in practice:
--   * rental_contracts        — 2nd contract per org per year fails
--   * rental_allocations      — 2nd allocation fails (so 2nd goods-in fails)
--   * rental_rates            — 2nd rate fails
--   * rental_stock_movements  — 2nd movement fails (so 2nd goods-in fails)
--   * inventory_movements     — window 10..15 lands on '0001' for a 3-char
--                               prefix, so MAX is always 1 and every number
--                               after the second repeats
--
-- Fix: extract the trailing digit run with SUBSTRING(... FROM '[0-9]+$'), which
-- is independent of prefix length and of the year/month format. The filters are
-- rewritten as anchored regexes for the same reason.
--
-- Date: 2026-09-28

-- ---------------------------------------------------------------------------
-- 1. Rental contract number:  CNT-<YY>-<4 digits>
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_contract_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_seq int;
  v_year text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(rc.contract_number FROM '[0-9]+$') AS int)), 0) + 1
  INTO v_seq
  FROM public.rental_contracts rc
  WHERE rc.organization_id = p_org_id
    AND rc.contract_number ~ ('^CNT-' || v_year || '-[0-9]+$');

  RETURN 'CNT-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Rental allocation number:  ALL-<YY>-<4 digits>
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_allocation_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_seq int;
  v_year text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(ra.allocation_number FROM '[0-9]+$') AS int)), 0) + 1
  INTO v_seq
  FROM public.rental_allocations ra
  WHERE ra.organization_id = p_org_id
    AND ra.allocation_number ~ ('^ALL-' || v_year || '-[0-9]+$');

  RETURN 'ALL-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Rental rate number:  RTR-<YY>-<4 digits>
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_rate_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_seq int;
  v_year text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(rr.rate_number FROM '[0-9]+$') AS int)), 0) + 1
  INTO v_seq
  FROM public.rental_rates rr
  WHERE rr.organization_id = p_org_id
    AND rr.rate_number ~ ('^RTR-' || v_year || '-[0-9]+$');

  RETURN 'RTR-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Rental stock movement number:  <4-char prefix>-<YY>-<6 digits>
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_rental_movement_number(p_org_id uuid, p_movement_type text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_prefix text;
  v_seq int;
  v_year text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');

  CASE p_movement_type
    WHEN 'RECEIVE' THEN v_prefix := 'RRCV';
    WHEN 'RELEASE' THEN v_prefix := 'RREL';
    WHEN 'TRANSFER_OUT' THEN v_prefix := 'RTRO';
    WHEN 'TRANSFER_IN' THEN v_prefix := 'RTRI';
    WHEN 'ADJUSTMENT' THEN v_prefix := 'RADJ';
    WHEN 'DAMAGE' THEN v_prefix := 'RDMG';
    WHEN 'EXPIRY' THEN v_prefix := 'REXP';
    ELSE v_prefix := 'RMVT';
  END CASE;

  SELECT COALESCE(MAX(CAST(SUBSTRING(rsm.movement_number FROM '[0-9]+$') AS int)), 0) + 1
  INTO v_seq
  FROM public.rental_stock_movements rsm
  WHERE rsm.organization_id = p_org_id
    AND rsm.movement_number ~ ('^' || v_prefix || '-' || v_year || '-[0-9]+$');

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_seq::text, 6, '0');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Inventory movement number:  <3-char prefix>-<YY>-<6 digits>
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_movement_number(p_org_id uuid, p_movement_type text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_prefix text;
  v_seq int;
  v_year text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');

  CASE p_movement_type
    WHEN 'RECEIVE' THEN v_prefix := 'RCV';
    WHEN 'ISSUE' THEN v_prefix := 'ISS';
    WHEN 'TRANSFER_OUT' THEN v_prefix := 'TRF';
    WHEN 'TRANSFER_IN' THEN v_prefix := 'TRF';
    WHEN 'ADJUSTMENT' THEN v_prefix := 'ADJ';
    WHEN 'RETURN' THEN v_prefix := 'RTN';
    WHEN 'DAMAGE' THEN v_prefix := 'DMG';
    WHEN 'EXPIRY' THEN v_prefix := 'EXP';
    ELSE v_prefix := 'MVT';
  END CASE;

  SELECT COALESCE(MAX(CAST(SUBSTRING(im.movement_number FROM '[0-9]+$') AS int)), 0) + 1
  INTO v_seq
  FROM public.inventory_movements im
  WHERE im.organization_id = p_org_id
    AND im.movement_number ~ ('^' || v_prefix || '-' || v_year || '-[0-9]+$');

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_seq::text, 6, '0');
END;
$function$;
