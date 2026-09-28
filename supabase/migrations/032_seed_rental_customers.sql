-- Migration: 032_seed_rental_customers.sql
-- Rental module unusable: no customer had is_rental_customer = true, and both
-- create_rental_contract() and the rental pages filter on that flag
--   (rental/contracts, rental/customers, rental/receiving all require it)
-- so the Rental menu could not create a single contract.
--
-- Flag the seeded customers that are meant to rent cold storage capacity.
-- Idempotent: re-running changes nothing once the flags are set.
-- Date: 2026-09-28

UPDATE public.customers c
SET is_rental_customer = true,
    updated_at = now()
WHERE c.code IN ('CUS001', 'CUS002', 'CUS003')
  AND c.is_rental_customer IS DISTINCT FROM true;

-- Units may be absent in a fresh environment; ensure KG exists for contracts.
INSERT INTO public.units (organization_id, code, name, description)
SELECT o.id, 'KG', 'Kilogram', 'Satuan berat kilogram'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.units u
  WHERE u.organization_id = o.id AND u.code = 'KG'
);
