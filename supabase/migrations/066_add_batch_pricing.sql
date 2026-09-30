-- Migration: 063_add_batch_pricing.sql
-- Date: 2026-09-30

-- Add pricing columns to inventory/batches for harga_beli/harga_jual tracking

ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS cost_price numeric(16,2) DEFAULT NULL;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS cost_price numeric(16,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS selling_price numeric(16,2) DEFAULT NULL;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost numeric(16,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS selling_price numeric(16,2) DEFAULT NULL;
