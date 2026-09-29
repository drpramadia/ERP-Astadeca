-- Migration: 059_fix_inventory_levels_sync.sql
--
-- `inventory_levels` never held a single row and every write to `inventory`
-- failed, because sync_inventory_levels() (041_notification_triggers.sql) had
-- three faults. This is why the Persediaan page had nothing to show.
--
--   1. Wrong source column. The function read `minimum_stock` from `products`,
--      but that table has `min_stock` (`minimum_stock` exists only on
--      inventory_levels itself). Every trigger firing raised
--      42703 column products.minimum_stock does not exist.
--
--   2. Unqualified column in the ON CONFLICT branch. `minimum_stock` there
--      resolved to the INSERT target's column, not a products column, giving
--      42702 ambiguous column reference.
--
--   3. The ON CONFLICT target had no matching unique index. No constraint
--      covered (organization_id, warehouse_id, product_id), so the upsert
--      itself could not be planned. inventory_levels was empty and stayed
--      empty: the aggregate the page reads never existed.
--
-- Fix: rebuild the function against `products.min_stock` with aliased
-- subqueries, add the unique constraint the upsert needs, then backfill from
-- current stock. NULLS NOT DISTINCT (PG 15+) so rows with a NULL warehouse_id
-- still collide on the same product instead of duplicating.
--
-- Date: 2026-09-29

-- ============================================================
-- 1. Unique constraint for the ON CONFLICT target
-- ============================================================
DELETE FROM public.inventory_levels a
USING public.inventory_levels b
WHERE a.ctid < b.ctid
  AND a.organization_id = b.organization_id
  AND a.product_id = b.product_id
  AND a.warehouse_id IS NOT DISTINCT FROM b.warehouse_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_levels_org_wh_product_key'
      AND conrelid = 'public.inventory_levels'::regclass
  ) THEN
    ALTER TABLE public.inventory_levels
      ADD CONSTRAINT inventory_levels_org_wh_product_key
      UNIQUE NULLS NOT DISTINCT (organization_id, warehouse_id, product_id);
  END IF;
END $$;

-- ============================================================
-- 2. Rebuild the sync function
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_inventory_levels()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_min_stock NUMERIC;
BEGIN
  SELECT p.min_stock INTO v_min_stock FROM products p WHERE p.id = NEW.product_id;
  v_min_stock := COALESCE(v_min_stock, 0);

  INSERT INTO inventory_levels (
    organization_id, warehouse_id, product_id, available_quantity, minimum_stock, updated_at
  )
  VALUES (
    NEW.organization_id, NEW.warehouse_id, NEW.product_id, NEW.quantity, v_min_stock, NOW()
  )
  ON CONFLICT (organization_id, warehouse_id, product_id)
  DO UPDATE SET
    available_quantity = COALESCE((
      SELECT SUM(i.quantity)
      FROM inventory i
      WHERE i.organization_id = NEW.organization_id
        AND i.warehouse_id = NEW.warehouse_id
        AND i.product_id = NEW.product_id
        AND i.status != 'BLOCKED'
    ), 0),
    minimum_stock = v_min_stock,
    updated_at = NOW();

  RETURN NEW;
END;
$function$;

-- ============================================================
-- 3. Backfill from current stock
-- ============================================================
INSERT INTO public.inventory_levels (
  organization_id, warehouse_id, product_id, available_quantity, minimum_stock, updated_at
)
SELECT i.organization_id,
       i.warehouse_id,
       i.product_id,
       COALESCE(SUM(i.quantity) FILTER (WHERE i.status <> 'BLOCKED'), 0),
       COALESCE(p.min_stock, 0),
       NOW()
FROM public.inventory i
JOIN public.products p ON p.id = i.product_id
GROUP BY i.organization_id, i.warehouse_id, i.product_id, p.min_stock
ON CONFLICT (organization_id, warehouse_id, product_id)
DO UPDATE SET
  available_quantity = EXCLUDED.available_quantity,
  minimum_stock     = EXCLUDED.minimum_stock,
  updated_at        = NOW();
