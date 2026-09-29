-- Migration: 052_drop_duplicate_fk_constraints.sql
--
-- Problem: 026_fk_cleanup.sql guarded each ADD CONSTRAINT on the constraint
-- NAME only:
--
--   IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rc_customer_fk')
--     ALTER TABLE rental_contracts ADD CONSTRAINT rc_customer_fk ...
--
-- Migration 005 had already created those columns' foreign keys under
-- Supabase's auto-generated names (rental_contracts_customer_fkey, ...), so
-- the name check passed and a SECOND foreign key was added on the SAME
-- column pair.
--
-- PostgREST then reported two relationships between the same tables and
-- refused every ambiguous embed, e.g.:
--   "Could not embed because more than one relationship was found for
--    'rental_contracts' and 'customers'"
-- which broke the rental contract list/detail, receiving, release,
-- inventory, reports and finance pages.
--
-- Fix: keep exactly ONE foreign key per relationship. Where a duplicate
-- carried ON DELETE CASCADE that the survivor did not, the survivor is
-- re-created WITH the cascade so no delete semantics are lost.
--
-- Surviving constraint names are the Supabase auto-generated ones
-- (code references rental_contracts_customer_fkey in the contracts and
-- receiving pages).
--
-- Date: 2026-09-29

-- ============================================================
-- 1. rental_allocations
-- ============================================================
-- cold_storage_id: keep rental_allocations_storage_fkey
ALTER TABLE public.rental_allocations DROP CONSTRAINT IF EXISTS ra_cs_fk;

-- product_id: keep rental_allocations_product_fkey
ALTER TABLE public.rental_allocations DROP CONSTRAINT IF EXISTS ra_product_fk;

-- contract_id: ra_contract_fk carried ON DELETE CASCADE the survivor lacked.
-- Re-create the survivor with the cascade preserved.
ALTER TABLE public.rental_allocations DROP CONSTRAINT IF EXISTS ra_contract_fk;
ALTER TABLE public.rental_allocations DROP CONSTRAINT IF EXISTS rental_allocations_contract_fkey;
ALTER TABLE public.rental_allocations ADD CONSTRAINT rental_allocations_contract_fkey
  FOREIGN KEY (contract_id) REFERENCES public.rental_contracts (id) ON DELETE CASCADE;

-- ============================================================
-- 2. rental_charges
-- ============================================================
ALTER TABLE public.rental_charges DROP CONSTRAINT IF EXISTS rch_contract_fk;

-- ============================================================
-- 3. rental_contracts
-- ============================================================
ALTER TABLE public.rental_contracts DROP CONSTRAINT IF EXISTS rc_customer_fk;
ALTER TABLE public.rental_contracts DROP CONSTRAINT IF EXISTS rc_org_fk;

-- cold_storage_id had THREE foreign keys: rc_cs_fk (NO ACTION),
-- rental_contracts_cs_fk (RESTRICT) and rental_contracts_cold_storage_fkey
-- (RESTRICT). Keep the canonical RESTRICT one.
ALTER TABLE public.rental_contracts DROP CONSTRAINT IF EXISTS rc_cs_fk;
ALTER TABLE public.rental_contracts DROP CONSTRAINT IF EXISTS rental_contracts_cs_fk;

-- ============================================================
-- 4. rental_invoices
-- ============================================================
ALTER TABLE public.rental_invoices DROP CONSTRAINT IF EXISTS ri_contract_fk;
ALTER TABLE public.rental_invoices DROP CONSTRAINT IF EXISTS ri_org_fk;

-- ============================================================
-- 5. rental_invoice_lines
-- ============================================================
-- ril_ri_fk carried ON DELETE CASCADE the survivor lacked — preserve it.
ALTER TABLE public.rental_invoice_lines DROP CONSTRAINT IF EXISTS ril_ri_fk;
ALTER TABLE public.rental_invoice_lines DROP CONSTRAINT IF EXISTS rental_invoice_lines_invoice_fkey;
ALTER TABLE public.rental_invoice_lines ADD CONSTRAINT rental_invoice_lines_invoice_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.rental_invoices (id) ON DELETE CASCADE;

-- ============================================================
-- 6. Refresh PostgREST schema cache so embeds stop resolving to the
--    removed duplicates.
-- ============================================================
NOTIFY pgrst, 'reload schema';
