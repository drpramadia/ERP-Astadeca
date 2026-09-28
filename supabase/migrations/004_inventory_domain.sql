-- Migration: 004_inventory_domain.sql
-- Description: Inventory management domain - batches, stock, movements, transfers, adjustments, opnames
-- Date: 2026-09-26

-- ============================================
-- TABLES
-- ============================================

-- ============================================
-- BATCHES
-- Product batch/lot tracking for FEFO
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."batches" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "batch_number" text NOT NULL,
    "supplier_id" uuid,
    "supplier_batch_number" text,
    "production_date" date,
    "received_date" date NOT NULL,
    "expiry_date" date,
    "best_before_date" date,
    "notes" text,
    "status" text DEFAULT 'ACTIVE'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "batches_status_check" CHECK (status = ANY (ARRAY['ACTIVE'::text, 'EXPIRED'::text, 'CONSUMED'::text, 'DESTROYED'::text])),
    CONSTRAINT "batches_org_product_batch_unique" UNIQUE ("organization_id", "product_id", "batch_number")
);

ALTER TABLE "public"."batches" OWNER TO "postgres";

-- ============================================
-- INVENTORY
-- Physical stock records
-- Owner model: owner_type + owner_id distinguishes COMPANY vs CUSTOMER ownership
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "warehouse_id" uuid NOT NULL,
    "cold_storage_id" uuid NOT NULL,
    "storage_location_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "batch_id" uuid NOT NULL,
    "owner_type" text NOT NULL,
    "owner_id" uuid NOT NULL,
    "quantity" numeric(14,3) DEFAULT 0 NOT NULL,
    "unit_id" uuid NOT NULL,
    "quantity_kg" numeric(14,3) DEFAULT 0,
    "status" text DEFAULT 'AVAILABLE'::text NOT NULL,
    "received_at" timestamp with time zone,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "inventory_owner_type_check" CHECK (owner_type = ANY (ARRAY['COMPANY'::text, 'CUSTOMER'::text])),
    CONSTRAINT "inventory_status_check" CHECK (status = ANY (ARRAY['AVAILABLE'::text, 'QUARANTINE'::text, 'DAMAGED'::text, 'EXPIRED'::text, 'BLOCKED'::text])),
    CONSTRAINT "inventory_quantity_check" CHECK (quantity >= 0),
    CONSTRAINT "inventory_quantity_kg_check" CHECK (quantity_kg IS NULL OR quantity_kg >= 0)
);

ALTER TABLE "public"."inventory" OWNER TO "postgres";

-- ============================================
-- INVENTORY MOVEMENTS (APPEND-ONLY LEDGER)
-- Immutable audit trail for all stock changes
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "movement_number" text NOT NULL,
    "movement_type" text NOT NULL,
    "inventory_id" uuid,
    "batch_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "source_warehouse_id" uuid,
    "source_cold_storage_id" uuid,
    "source_location_id" uuid,
    "destination_warehouse_id" uuid,
    "destination_cold_storage_id" uuid,
    "destination_location_id" uuid,
    "owner_type" text NOT NULL,
    "owner_id" uuid NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "unit_id" uuid NOT NULL,
    "quantity_kg" numeric(14,3),
    "source_entity_type" text,
    "source_entity_id" uuid,
    "reason" text,
    "notes" text,
    "reference_number" text,
    -- Transfer reference links TRANSFER_OUT and TRANSFER_IN movements
    "transfer_reference_id" uuid,
    "performed_by" uuid NOT NULL,
    "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "inventory_movements_type_check" CHECK (movement_type = ANY (ARRAY['RECEIVE'::text, 'ISSUE'::text, 'TRANSFER_OUT'::text, 'TRANSFER_IN'::text, 'ADJUSTMENT'::text, 'RETURN'::text, 'DAMAGE'::text, 'EXPIRY'::text])),
    CONSTRAINT "inventory_movements_quantity_check" CHECK (quantity > 0)
);

ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";

-- ============================================
-- STOCK OPNAMES
-- Physical count records
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."stock_opnames" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "warehouse_id" uuid NOT NULL,
    "cold_storage_id" uuid,
    "opname_number" text NOT NULL,
    "status" text DEFAULT 'PLANNED'::text NOT NULL,
    "planned_date" date NOT NULL,
    "counted_date" date,
    "notes" text,
    "approval_request_id" uuid,
    "performed_by" uuid NOT NULL,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "stock_opnames_status_check" CHECK (status = ANY (ARRAY['PLANNED'::text, 'IN_PROGRESS'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."stock_opnames" OWNER TO "postgres";

-- ============================================
-- STOCK OPNAME ITEMS
-- Line items for each opname
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."stock_opname_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "opname_id" uuid NOT NULL,
    "inventory_id" uuid NOT NULL,
    "batch_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "storage_location_id" uuid NOT NULL,
    "planned_quantity" numeric(14,3) NOT NULL,
    "planned_quantity_kg" numeric(14,3),
    "counted_quantity" numeric(14,3),
    "counted_quantity_kg" numeric(14,3),
    "variance_quantity" numeric(14,3),
    "variance_quantity_kg" numeric(14,3),
    "variance_reason" text,
    "photo_url" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."stock_opname_items" OWNER TO "postgres";

-- ============================================
-- STOCK ADJUSTMENTS
-- Records adjustments requiring approval
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."stock_adjustments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "adjustment_number" text NOT NULL,
    "adjustment_type" text NOT NULL,
    "reason" text NOT NULL,
    "notes" text,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "approval_request_id" uuid,
    "performed_by" uuid NOT NULL,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "stock_adjustments_adjustment_type_check" CHECK (adjustment_type = ANY (ARRAY['INCREASE'::text, 'DECREASE'::text])),
    CONSTRAINT "stock_adjustments_reason_check" CHECK (reason = ANY (ARRAY['COUNT_DIFFERENCE'::text, 'DAMAGE'::text, 'EXPIRY'::text, 'WEIGHT_LOSS'::text, 'SYSTEM_CORRECTION'::text, 'OTHER'::text])),
    CONSTRAINT "stock_adjustments_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."stock_adjustments" OWNER TO "postgres";

-- ============================================
-- STOCK ADJUSTMENT ITEMS
-- Line items for each adjustment
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."stock_adjustment_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "adjustment_id" uuid NOT NULL,
    "inventory_id" uuid NOT NULL,
    "batch_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "current_quantity" numeric(14,3) NOT NULL,
    "adjusted_quantity" numeric(14,3) NOT NULL,
    "variance_quantity" numeric(14,3) NOT NULL,
    "unit_id" uuid NOT NULL,
    "current_quantity_kg" numeric(14,3),
    "adjusted_quantity_kg" numeric(14,3),
    "variance_quantity_kg" numeric(14,3),
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."stock_adjustment_items" OWNER TO "postgres";

-- ============================================
-- STOCK TRANSFERS
-- Records transfer operations between locations
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."stock_transfers" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "transfer_number" text NOT NULL,
    "source_warehouse_id" uuid NOT NULL,
    "source_cold_storage_id" uuid NOT NULL,
    "destination_warehouse_id" uuid NOT NULL,
    "destination_cold_storage_id" uuid NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "notes" text,
    "approval_request_id" uuid,
    "performed_by" uuid NOT NULL,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "transferred_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "stock_transfers_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'IN_TRANSIT'::text, 'COMPLETED'::text, 'REJECTED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."stock_transfers" OWNER TO "postgres";

-- ============================================
-- STOCK TRANSFER ITEMS
-- Line items for each transfer
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."stock_transfer_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "transfer_id" uuid NOT NULL,
    "inventory_id" uuid NOT NULL,
    "batch_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "source_location_id" uuid NOT NULL,
    "destination_location_id" uuid NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "unit_id" uuid NOT NULL,
    "quantity_kg" numeric(14,3),
    "owner_type" text NOT NULL,
    "owner_id" uuid NOT NULL,
    "movement_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."stock_transfer_items" OWNER TO "postgres";



-- ============================================
-- INDEXES
-- ============================================

-- Batches indexes
CREATE INDEX IF NOT EXISTS "idx_batches_org" ON "public"."batches" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_batches_product" ON "public"."batches" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "idx_batches_supplier" ON "public"."batches" USING btree ("supplier_id");
CREATE INDEX IF NOT EXISTS "idx_batches_expiry" ON "public"."batches" USING btree ("expiry_date") WHERE "expiry_date" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_batches_batch_number" ON "public"."batches" USING btree ("organization_id", "product_id", "batch_number");

-- Inventory indexes
CREATE INDEX IF NOT EXISTS "idx_inventory_org" ON "public"."inventory" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_warehouse" ON "public"."inventory" USING btree ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_cold_storage" ON "public"."inventory" USING btree ("cold_storage_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_location" ON "public"."inventory" USING btree ("storage_location_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_product" ON "public"."inventory" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_batch" ON "public"."inventory" USING btree ("batch_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_owner" ON "public"."inventory" USING btree ("owner_type", "owner_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_status" ON "public"."inventory" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_inventory_expiry" ON "public"."inventory" USING btree ("received_at") WHERE "received_at" IS NOT NULL;

-- Inventory movements indexes
CREATE INDEX IF NOT EXISTS "idx_movements_org" ON "public"."inventory_movements" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_movements_number" ON "public"."inventory_movements" USING btree ("movement_number");
CREATE INDEX IF NOT EXISTS "idx_movements_type" ON "public"."inventory_movements" USING btree ("movement_type");
CREATE INDEX IF NOT EXISTS "idx_movements_inventory" ON "public"."inventory_movements" USING btree ("inventory_id");
CREATE INDEX IF NOT EXISTS "idx_movements_batch" ON "public"."inventory_movements" USING btree ("batch_id");
CREATE INDEX IF NOT EXISTS "idx_movements_product" ON "public"."inventory_movements" USING btree ("product_id");
CREATE INDEX IF NOT EXISTS "idx_movements_source_location" ON "public"."inventory_movements" USING btree ("source_location_id");
CREATE INDEX IF NOT EXISTS "idx_movements_dest_location" ON "public"."inventory_movements" USING btree ("destination_location_id");
CREATE INDEX IF NOT EXISTS "idx_movements_performed_by" ON "public"."inventory_movements" USING btree ("performed_by");
CREATE INDEX IF NOT EXISTS "idx_movements_performed_at" ON "public"."inventory_movements" USING btree ("performed_at");
CREATE INDEX IF NOT EXISTS "idx_movements_source_entity" ON "public"."inventory_movements" USING btree ("source_entity_type", "source_entity_id");

-- Stock opnames indexes
CREATE INDEX IF NOT EXISTS "idx_opnames_org" ON "public"."stock_opnames" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_opnames_number" ON "public"."stock_opnames" USING btree ("opname_number");
CREATE INDEX IF NOT EXISTS "idx_opnames_status" ON "public"."stock_opnames" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_opnames_approval" ON "public"."stock_opnames" USING btree ("approval_request_id");

-- Stock opname items indexes
CREATE INDEX IF NOT EXISTS "idx_opname_items_opname" ON "public"."stock_opname_items" USING btree ("opname_id");
CREATE INDEX IF NOT EXISTS "idx_opname_items_inventory" ON "public"."stock_opname_items" USING btree ("inventory_id");

-- Stock adjustments indexes
CREATE INDEX IF NOT EXISTS "idx_adjustments_org" ON "public"."stock_adjustments" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_adjustments_number" ON "public"."stock_adjustments" USING btree ("adjustment_number");
CREATE INDEX IF NOT EXISTS "idx_adjustments_status" ON "public"."stock_adjustments" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_adjustments_approval" ON "public"."stock_adjustments" USING btree ("approval_request_id");

-- Stock adjustment items indexes
CREATE INDEX IF NOT EXISTS "idx_adjustment_items_adjustment" ON "public"."stock_adjustment_items" USING btree ("adjustment_id");
CREATE INDEX IF NOT EXISTS "idx_adjustment_items_inventory" ON "public"."stock_adjustment_items" USING btree ("inventory_id");

-- Stock transfers indexes
CREATE INDEX IF NOT EXISTS "idx_transfers_org" ON "public"."stock_transfers" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_transfers_number" ON "public"."stock_transfers" USING btree ("transfer_number");
CREATE INDEX IF NOT EXISTS "idx_transfers_status" ON "public"."stock_transfers" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_transfers_approval" ON "public"."stock_transfers" USING btree ("approval_request_id");

-- Stock transfer items indexes
CREATE INDEX IF NOT EXISTS "idx_transfer_items_transfer" ON "public"."stock_transfer_items" USING btree ("transfer_id");
CREATE INDEX IF NOT EXISTS "idx_transfer_items_inventory" ON "public"."stock_transfer_items" USING btree ("inventory_id");
CREATE INDEX IF NOT EXISTS "idx_transfer_items_movement" ON "public"."stock_transfer_items" USING btree ("movement_id");

-- ============================================
-- FOREIGN KEYS
-- ============================================

-- Batches FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "batches"::regclass AND conname = "batches_organization_id_fkey"
  ) THEN
    ALTER TABLE "batches" ADD CONSTRAINT "batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "batches"::regclass AND conname = "batches_product_id_fkey"
  ) THEN
    ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "batches"::regclass AND conname = "batches_supplier_id_fkey"
  ) THEN
    ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers" ("id");
  END IF;
END;
$$;


-- Inventory FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory"::regclass AND conname = "inventory_organization_id_fkey"
  ) THEN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory"::regclass AND conname = "inventory_warehouse_id_fkey"
  ) THEN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory"::regclass AND conname = "inventory_cold_storage_id_fkey"
  ) THEN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_cold_storage_id_fkey" FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory"::regclass AND conname = "inventory_storage_location_id_fkey"
  ) THEN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "public"."storage_locations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory"::regclass AND conname = "inventory_product_id_fkey"
  ) THEN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory"::regclass AND conname = "inventory_batch_id_fkey"
  ) THEN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory"::regclass AND conname = "inventory_unit_id_fkey"
  ) THEN
    ALTER TABLE "inventory" ADD CONSTRAINT "inventory_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;


-- Inventory movements FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_organization_id_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_batch_id_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_product_id_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_source_warehouse_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_source_warehouse_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_source_cold_storage_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_source_cold_storage_fkey" FOREIGN KEY ("source_cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_source_location_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_source_location_fkey" FOREIGN KEY ("source_location_id") REFERENCES "public"."storage_locations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_dest_warehouse_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_dest_warehouse_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_dest_cold_storage_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_dest_cold_storage_fkey" FOREIGN KEY ("destination_cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_dest_location_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_dest_location_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "public"."storage_locations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_unit_id_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "inventory_movements"::regclass AND conname = "movements_performed_by_fkey"
  ) THEN
    ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;


-- Stock opnames FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opnames"::regclass AND conname = "opnames_organization_id_fkey"
  ) THEN
    ALTER TABLE "stock_opnames" ADD CONSTRAINT "opnames_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opnames"::regclass AND conname = "opnames_warehouse_id_fkey"
  ) THEN
    ALTER TABLE "stock_opnames" ADD CONSTRAINT "opnames_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opnames"::regclass AND conname = "opnames_cold_storage_id_fkey"
  ) THEN
    ALTER TABLE "stock_opnames" ADD CONSTRAINT "opnames_cold_storage_id_fkey" FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opnames"::regclass AND conname = "opnames_performed_by_fkey"
  ) THEN
    ALTER TABLE "stock_opnames" ADD CONSTRAINT "opnames_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opnames"::regclass AND conname = "opnames_approved_by_fkey"
  ) THEN
    ALTER TABLE "stock_opnames" ADD CONSTRAINT "opnames_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opnames"::regclass AND conname = "opnames_approval_request_fkey"
  ) THEN
    ALTER TABLE "stock_opnames" ADD CONSTRAINT "opnames_approval_request_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests" ("id");
  END IF;
END;
$$;


-- Stock opname items FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opname_items"::regclass AND conname = "opname_items_opname_id_fkey"
  ) THEN
    ALTER TABLE "stock_opname_items" ADD CONSTRAINT "opname_items_opname_id_fkey" FOREIGN KEY ("opname_id") REFERENCES "public"."stock_opnames" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opname_items"::regclass AND conname = "opname_items_inventory_id_fkey"
  ) THEN
    ALTER TABLE "stock_opname_items" ADD CONSTRAINT "opname_items_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opname_items"::regclass AND conname = "opname_items_batch_id_fkey"
  ) THEN
    ALTER TABLE "stock_opname_items" ADD CONSTRAINT "opname_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opname_items"::regclass AND conname = "opname_items_product_id_fkey"
  ) THEN
    ALTER TABLE "stock_opname_items" ADD CONSTRAINT "opname_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_opname_items"::regclass AND conname = "opname_items_location_id_fkey"
  ) THEN
    ALTER TABLE "stock_opname_items" ADD CONSTRAINT "opname_items_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "public"."storage_locations" ("id");
  END IF;
END;
$$;


-- Stock adjustments FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_adjustments"::regclass AND conname = "adjustments_organization_id_fkey"
  ) THEN
    ALTER TABLE "stock_adjustments" ADD CONSTRAINT "adjustments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_adjustments"::regclass AND conname = "adjustments_performed_by_fkey"
  ) THEN
    ALTER TABLE "stock_adjustments" ADD CONSTRAINT "adjustments_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_adjustments"::regclass AND conname = "adjustments_approved_by_fkey"
  ) THEN
    ALTER TABLE "stock_adjustments" ADD CONSTRAINT "adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_adjustments"::regclass AND conname = "adjustments_approval_request_fkey"
  ) THEN
    ALTER TABLE "stock_adjustments" ADD CONSTRAINT "adjustments_approval_request_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests" ("id");
  END IF;
END;
$$;


-- Stock adjustment items FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_adjustment_items"::regclass AND conname = "adj_items_adjustment_id_fkey"
  ) THEN
    ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "adj_items_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustments" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_adjustment_items"::regclass AND conname = "adj_items_inventory_id_fkey"
  ) THEN
    ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "adj_items_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_adjustment_items"::regclass AND conname = "adj_items_batch_id_fkey"
  ) THEN
    ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "adj_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_adjustment_items"::regclass AND conname = "adj_items_product_id_fkey"
  ) THEN
    ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "adj_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_adjustment_items"::regclass AND conname = "adj_items_unit_id_fkey"
  ) THEN
    ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "adj_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;


-- Stock transfers FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfers"::regclass AND conname = "transfers_organization_id_fkey"
  ) THEN
    ALTER TABLE "stock_transfers" ADD CONSTRAINT "transfers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfers"::regclass AND conname = "transfers_source_warehouse_fkey"
  ) THEN
    ALTER TABLE "stock_transfers" ADD CONSTRAINT "transfers_source_warehouse_fkey" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfers"::regclass AND conname = "transfers_source_cold_storage_fkey"
  ) THEN
    ALTER TABLE "stock_transfers" ADD CONSTRAINT "transfers_source_cold_storage_fkey" FOREIGN KEY ("source_cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfers"::regclass AND conname = "transfers_dest_warehouse_fkey"
  ) THEN
    ALTER TABLE "stock_transfers" ADD CONSTRAINT "transfers_dest_warehouse_fkey" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfers"::regclass AND conname = "transfers_dest_cold_storage_fkey"
  ) THEN
    ALTER TABLE "stock_transfers" ADD CONSTRAINT "transfers_dest_cold_storage_fkey" FOREIGN KEY ("destination_cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfers"::regclass AND conname = "transfers_performed_by_fkey"
  ) THEN
    ALTER TABLE "stock_transfers" ADD CONSTRAINT "transfers_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfers"::regclass AND conname = "transfers_approved_by_fkey"
  ) THEN
    ALTER TABLE "stock_transfers" ADD CONSTRAINT "transfers_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfers"::regclass AND conname = "transfers_approval_request_fkey"
  ) THEN
    ALTER TABLE "stock_transfers" ADD CONSTRAINT "transfers_approval_request_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests" ("id");
  END IF;
END;
$$;


-- Stock transfer items FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfer_items"::regclass AND conname = "transfer_items_transfer_id_fkey"
  ) THEN
    ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfer_items"::regclass AND conname = "transfer_items_inventory_id_fkey"
  ) THEN
    ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "transfer_items_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfer_items"::regclass AND conname = "transfer_items_batch_id_fkey"
  ) THEN
    ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "transfer_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfer_items"::regclass AND conname = "transfer_items_product_id_fkey"
  ) THEN
    ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfer_items"::regclass AND conname = "transfer_items_source_location_fkey"
  ) THEN
    ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "transfer_items_source_location_fkey" FOREIGN KEY ("source_location_id") REFERENCES "public"."storage_locations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfer_items"::regclass AND conname = "transfer_items_dest_location_fkey"
  ) THEN
    ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "transfer_items_dest_location_fkey" FOREIGN KEY ("destination_location_id") REFERENCES "public"."storage_locations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfer_items"::regclass AND conname = "transfer_items_unit_id_fkey"
  ) THEN
    ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "transfer_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "stock_transfer_items"::regclass AND conname = "transfer_items_movement_id_fkey"
  ) THEN
    ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "transfer_items_movement_id_fkey" FOREIGN KEY ("movement_id") REFERENCES "public"."inventory_movements" ("id");
  END IF;
END;
$$;




-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

DROP TRIGGER IF EXISTS "batches_updated_at" ON "public"."batches";
CREATE TRIGGER "batches_updated_at"
    BEFORE UPDATE ON "public"."batches"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "inventory_updated_at" ON "public"."inventory";
CREATE TRIGGER "inventory_updated_at"
    BEFORE UPDATE ON "public"."inventory"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "stock_opnames_updated_at" ON "public"."stock_opnames";
CREATE TRIGGER "stock_opnames_updated_at"
    BEFORE UPDATE ON "public"."stock_opnames"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "stock_opname_items_updated_at" ON "public"."stock_opname_items";
CREATE TRIGGER "stock_opname_items_updated_at"
    BEFORE UPDATE ON "public"."stock_opname_items"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "stock_adjustments_updated_at" ON "public"."stock_adjustments";
CREATE TRIGGER "stock_adjustments_updated_at"
    BEFORE UPDATE ON "public"."stock_adjustments"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "stock_transfer_updated_at" ON "public"."stock_transfers";
CREATE TRIGGER "stock_transfer_updated_at"
    BEFORE UPDATE ON "public"."stock_transfers"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE "public"."batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_opnames" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_opname_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_adjustment_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_transfer_items" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Batches policies
CREATE POLICY "batches_select" ON "public"."batches" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "batches_insert" ON "public"."batches" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'inventory.manage'::text));
CREATE POLICY "batches_update" ON "public"."batches" FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'inventory.manage'::text));
CREATE POLICY "batches_delete" ON "public"."batches" FOR DELETE USING ("public"."has_org_permission"("organization_id", 'inventory.manage'::text));

-- Inventory policies
CREATE POLICY "inventory_select" ON "public"."inventory" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "inventory_insert" ON "public"."inventory" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'inventory.manage'::text));
CREATE POLICY "inventory_update" ON "public"."inventory" FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'inventory.manage'::text));
CREATE POLICY "inventory_delete" ON "public"."inventory" FOR DELETE USING ("public"."has_org_permission"("organization_id", 'inventory.manage'::text));

-- Inventory movements policies (append-only - no UPDATE/DELETE)
CREATE POLICY "inventory_movements_select" ON "public"."inventory_movements" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "inventory_movements_insert" ON "public"."inventory_movements" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'inventory.manage'::text));

-- Stock opnames policies
CREATE POLICY "stock_opnames_select" ON "public"."stock_opnames" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "stock_opnames_insert" ON "public"."stock_opnames" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'inventory.opname'::text));
CREATE POLICY "stock_opnames_update" ON "public"."stock_opnames" FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'inventory.opname'::text));

-- Stock opname items policies
CREATE POLICY "stock_opname_items_select" ON "public"."stock_opname_items" FOR SELECT USING (
    EXISTS (SELECT 1 FROM "public"."stock_opnames" so WHERE so."id" = "stock_opname_items"."opname_id" AND "public"."is_org_member"(so."organization_id"))
);
CREATE POLICY "stock_opname_items_insert" ON "public"."stock_opname_items" FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "public"."stock_opnames" so WHERE so."id" = "stock_opname_items"."opname_id" AND "public"."has_org_permission"(so."organization_id", 'inventory.opname'::text))
);
CREATE POLICY "stock_opname_items_update" ON "public"."stock_opname_items" FOR UPDATE USING (
    EXISTS (SELECT 1 FROM "public"."stock_opnames" so WHERE so."id" = "stock_opname_items"."opname_id" AND "public"."has_org_permission"(so."organization_id", 'inventory.opname'::text))
);

-- Stock adjustments policies
CREATE POLICY "stock_adjustments_select" ON "public"."stock_adjustments" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "stock_adjustments_insert" ON "public"."stock_adjustments" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'inventory.adjust'::text));
CREATE POLICY "stock_adjustments_update" ON "public"."stock_adjustments" FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'inventory.adjust'::text));

-- Stock adjustment items policies
CREATE POLICY "stock_adjustment_items_select" ON "public"."stock_adjustment_items" FOR SELECT USING (
    EXISTS (SELECT 1 FROM "public"."stock_adjustments" sa WHERE sa."id" = "stock_adjustment_items"."adjustment_id" AND "public"."is_org_member"(sa."organization_id"))
);
CREATE POLICY "stock_adjustment_items_insert" ON "public"."stock_adjustment_items" FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "public"."stock_adjustments" sa WHERE sa."id" = "stock_adjustment_items"."adjustment_id" AND "public"."has_org_permission"(sa."organization_id", 'inventory.adjust'::text))
);
CREATE POLICY "stock_adjustment_items_update" ON "public"."stock_adjustment_items" FOR UPDATE USING (
    EXISTS (SELECT 1 FROM "public"."stock_adjustments" sa WHERE sa."id" = "stock_adjustment_items"."adjustment_id" AND "public"."has_org_permission"(sa."organization_id", 'inventory.adjust'::text))
);

-- Stock transfers policies
CREATE POLICY "stock_transfers_select" ON "public"."stock_transfers" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "stock_transfers_insert" ON "public"."stock_transfers" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'inventory.transfer'::text));
CREATE POLICY "stock_transfers_update" ON "public"."stock_transfers" FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'inventory.transfer'::text));

-- Stock transfer items policies
CREATE POLICY "stock_transfer_items_select" ON "public"."stock_transfer_items" FOR SELECT USING (
    EXISTS (SELECT 1 FROM "public"."stock_transfers" st WHERE st."id" = "stock_transfer_items"."transfer_id" AND "public"."is_org_member"(st."organization_id"))
);
CREATE POLICY "stock_transfer_items_insert" ON "public"."stock_transfer_items" FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "public"."stock_transfers" st WHERE st."id" = "stock_transfer_items"."transfer_id" AND "public"."has_org_permission"(st."organization_id", 'inventory.transfer'::text))
);
CREATE POLICY "stock_transfer_items_update" ON "public"."stock_transfer_items" FOR UPDATE USING (
    EXISTS (SELECT 1 FROM "public"."stock_transfers" st WHERE st."id" = "stock_transfer_items"."transfer_id" AND "public"."has_org_permission"(st."organization_id", 'inventory.transfer'::text))
);



-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get current stock for a specific inventory record
CREATE OR REPLACE FUNCTION "public"."get_inventory_stock"(p_inventory_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(
    CASE 
      WHEN im.movement_type IN ('RECEIVE', 'RETURN', 'ADJUSTMENT') THEN im.quantity
      ELSE -im.quantity
    END
  ), 0)
  FROM "public"."inventory_movements" im
  WHERE im.inventory_id = p_inventory_id;
$$;

-- Calculate available stock by product (excluding quarantine, damaged, expired, blocked)
CREATE OR REPLACE FUNCTION "public"."get_available_stock_by_product"(
  p_organization_id uuid,
  p_product_id uuid,
  p_owner_type text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
))
RETURNS TABLE (
  total_quantity numeric,
  total_quantity_kg numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    COALESCE(SUM(i.quantity), 0)::numeric as total_quantity,
    COALESCE(SUM(i.quantity_kg), 0)::numeric as total_quantity_kg
  FROM "public"."inventory" i
  WHERE i.organization_id = p_organization_id
    AND i.product_id = p_product_id
    AND i.status = 'AVAILABLE'
    AND (p_owner_type IS NULL OR i.owner_type = p_owner_type)
    AND (p_owner_id IS NULL OR i.owner_id = p_owner_id);
$$;

-- Calculate stock by status for an organization
CREATE OR REPLACE FUNCTION "public"."get_stock_by_status"(
  p_organization_id uuid,
  p_warehouse_id uuid DEFAULT NULL,
  p_cold_storage_id uuid DEFAULT NULL
)
RETURNS TABLE (
  status text,
  total_quantity numeric,
  total_quantity_kg numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    i.status,
    SUM(i.quantity)::numeric as total_quantity,
    SUM(i.quantity_kg)::numeric as total_quantity_kg
  FROM "public"."inventory" i
  WHERE i.organization_id = p_organization_id
    AND (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id)
    AND (p_cold_storage_id IS NULL OR i.cold_storage_id = p_cold_storage_id)
  GROUP BY i.status;
$$;

-- Get FEFO-eligible inventory for a product
-- Returns inventory records ordered by expiry date, then received date, then ID
CREATE OR REPLACE FUNCTION "public"."get_fefo_inventory"(
  p_organization_id uuid,
  p_product_id uuid,
  p_required_quantity numeric,
  p_owner_type text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL,
  p_cold_storage_id uuid DEFAULT NULL,
  p_storage_location_id uuid DEFAULT NULL
)
RETURNS TABLE (
  inventory_id uuid,
  batch_id uuid,
  quantity numeric,
  quantity_kg numeric,
  expiry_date date,
  received_at timestamptz,
  cold_storage_id uuid,
  storage_location_id uuid,
  owner_type text,
  owner_id uuid
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    i.id as inventory_id,
    i.batch_id,
    i.quantity,
    i.quantity_kg,
    b.expiry_date,
    i.received_at,
    i.cold_storage_id,
    i.storage_location_id,
    i.owner_type,
    i.owner_id
  FROM "public"."inventory" i
  JOIN "public"."batches" b ON b.id = i.batch_id
  WHERE i.organization_id = p_organization_id
    AND i.product_id = p_product_id
    AND i.status = 'AVAILABLE'
    AND (p_owner_type IS NULL OR i.owner_type = p_owner_type)
    AND (p_owner_id IS NULL OR i.owner_id = p_owner_id)
    AND (p_cold_storage_id IS NULL OR i.cold_storage_id = p_cold_storage_id)
    AND (p_storage_location_id IS NULL OR i.storage_location_id = p_storage_location_id)
    AND b.status = 'ACTIVE'
    AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)
  ORDER BY 
    b.expiry_date ASC NULLS LAST,
    i.received_at ASC NULLS LAST,
    i.id ASC;
$$;

-- Calculate cold storage capacity utilization
CREATE OR REPLACE FUNCTION "public"."get_cold_storage_capacity"(
  p_cold_storage_id uuid,
  p_owner_type text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS TABLE (
  total_capacity_kg numeric,
  occupied_kg numeric,
  available_kg numeric,
  utilization_percentage numeric,
  company_occupied_kg numeric,
  customer_occupied_kg numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH cs AS (
    SELECT capacity_kg 
    FROM "public"."cold_storages" 
    WHERE id = p_cold_storage_id
  ),
  occupied AS (
    SELECT 
      COALESCE(SUM(CASE WHEN i.owner_type = 'COMPANY' THEN i.quantity_kg ELSE 0 END), 0)::numeric as company_kg,
      COALESCE(SUM(CASE WHEN i.owner_type = 'CUSTOMER' THEN i.quantity_kg ELSE 0 END), 0)::numeric as customer_kg,
      COALESCE(SUM(i.quantity_kg), 0)::numeric as total_kg
    FROM "public"."inventory" i
    WHERE i.cold_storage_id = p_cold_storage_id
      AND i.status IN ('AVAILABLE', 'QUARANTINE')
      AND (p_owner_type IS NULL OR i.owner_type = p_owner_type)
      AND (p_owner_id IS NULL OR i.owner_id = p_owner_id)
  )
  SELECT 
    cs.capacity_kg as total_capacity_kg,
    COALESCE(occ.total_kg, 0) as occupied_kg,
    cs.capacity_kg - COALESCE(occ.total_kg, 0) as available_kg,
    CASE WHEN cs.capacity_kg > 0 
      THEN (COALESCE(occ.total_kg, 0) / cs.capacity_kg * 100)::numeric(5,2)
      ELSE 0 
    END as utilization_percentage,
    COALESCE(occ.company_kg, 0) as company_occupied_kg,
    COALESCE(occ.customer_kg, 0) as customer_occupied_kg
  FROM cs
  CROSS JOIN occupied occ;
$$;

-- Calculate storage location capacity utilization
CREATE OR REPLACE FUNCTION "public"."get_storage_location_capacity"(
  p_storage_location_id uuid
)
RETURNS TABLE (
  total_capacity_kg numeric,
  occupied_kg numeric,
  available_kg numeric,
  utilization_percentage numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH loc AS (
    SELECT capacity_kg 
    FROM "public"."storage_locations" 
    WHERE id = p_storage_location_id
  ),
  occupied AS (
    SELECT COALESCE(SUM(i.quantity_kg), 0)::numeric as total_kg
    FROM "public"."inventory" i
    WHERE i.storage_location_id = p_storage_location_id
      AND i.status IN ('AVAILABLE', 'QUARANTINE')
  )
  SELECT 
    loc.capacity_kg as total_capacity_kg,
    COALESCE(occ.total_kg, 0) as occupied_kg,
    loc.capacity_kg - COALESCE(occ.total_kg, 0) as available_kg,
    CASE WHEN loc.capacity_kg > 0 
      THEN (COALESCE(occ.total_kg, 0) / loc.capacity_kg * 100)::numeric(5,2)
      ELSE 0 
    END as utilization_percentage
  FROM loc
  CROSS JOIN occupied occ;
$$;

-- Get expiring batches (within specified days)
CREATE OR REPLACE FUNCTION "public"."get_expiring_batches"(
  p_organization_id uuid,
  p_days_ahead integer DEFAULT 30,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  batch_id uuid,
  product_id uuid,
  product_name text,
  batch_number text,
  expiry_date date,
  days_until_expiry integer,
  total_quantity numeric,
  cold_storage_name text
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    b.id as batch_id,
    b.product_id,
    p.name as product_name,
    b.batch_number,
    b.expiry_date,
    (b.expiry_date - CURRENT_DATE)::integer as days_until_expiry,
    COALESCE(SUM(i.quantity), 0)::numeric as total_quantity,
    cs.name as cold_storage_name
  FROM "public"."batches" b
  JOIN "public"."products" p ON p.id = b.product_id
  JOIN "public"."inventory" i ON i.batch_id = b.id
  JOIN "public"."cold_storages" cs ON cs.id = i.cold_storage_id
  WHERE b.organization_id = p_organization_id
    AND b.expiry_date IS NOT NULL
    AND b.expiry_date <= CURRENT_DATE + p_days_ahead
    AND b.expiry_date >= CURRENT_DATE
    AND b.status = 'ACTIVE'
    AND i.status IN ('AVAILABLE', 'QUARANTINE')
  GROUP BY b.id, b.product_id, p.name, b.batch_number, b.expiry_date, cs.name
  ORDER BY b.expiry_date ASC
  LIMIT p_limit;
$$;

-- Check if inventory can be issued (status validation)
CREATE OR REPLACE FUNCTION "public"."can_issue_inventory"(p_inventory_id uuid)
RETURNS TABLE (
  can_issue boolean,
  status text,
  message text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN i.status = 'AVAILABLE' THEN true
      ELSE false
    END as can_issue,
    i.status as status,
    CASE 
      WHEN i.status = 'AVAILABLE' THEN 'OK'
      WHEN i.status = 'QUARANTINE' THEN 'Stock is in quarantine'
      WHEN i.status = 'DAMAGED' THEN 'Stock is damaged'
      WHEN i.status = 'EXPIRED' THEN 'Stock has expired'
      WHEN i.status = 'BLOCKED' THEN 'Stock is blocked'
      ELSE 'Unknown status'
    END as message
  FROM "public"."inventory" i
  WHERE i.id = p_inventory_id;
END;
$$;

-- Generate movement number
CREATE OR REPLACE FUNCTION "public"."generate_movement_number"(p_org_id uuid,
  p_movement_type text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
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
  
  -- Get next sequence number (simplified - in production use a sequence table)
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(im.movement_number FROM 10 FOR 6) AS int)
  ), 0) + 1
  INTO v_seq
  FROM "public"."inventory_movements" im
  WHERE im.organization_id = p_org_id
    AND im.movement_number LIKE v_prefix || '-' || v_year || '-%';
  
  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_seq::text, 6, '0');
END;
$$;



-- ============================================
-- RPC FUNCTIONS FOR ATOMIC OPERATIONS
-- ============================================

-- Receive inventory (creates batch if needed and inventory record)
CREATE OR REPLACE FUNCTION "public"."receive_inventory"(
  p_organization_id uuid,
  p_warehouse_id uuid,
  p_cold_storage_id uuid,
  p_storage_location_id uuid,
  p_product_id uuid,
  p_batch_id uuid,
  p_owner_type text,
  p_owner_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_performed_by uuid,
  p_quantity_kg numeric DEFAULT NULL,
  p_reference_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  inventory_id uuid,
  movement_id uuid,
  movement_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inventory_id uuid;
  v_movement_id uuid;
  v_movement_number text;
  v_existing_inventory_id uuid;
  v_cs_capacity numeric;
  v_cs_occupied numeric;
  v_loc_capacity numeric;
  v_loc_occupied numeric;
  v_quantity_kg numeric;
BEGIN
  -- Calculate quantity in KG
  v_quantity_kg := COALESCE(p_quantity_kg, p_quantity);
  
  -- Check cold storage capacity before receiving
  SELECT total_capacity_kg, occupied_kg INTO v_cs_capacity, v_cs_occupied
  FROM "public"."get_cold_storage_capacity"(p_cold_storage_id, NULL, NULL);
  
  IF v_cs_occupied + v_quantity_kg > v_cs_capacity THEN
    RAISE EXCEPTION 'Cold storage capacity exceeded: available=%, requested=%', 
      (v_cs_capacity - v_cs_occupied), v_quantity_kg;
  END IF;
  
  -- Check storage location capacity before receiving
  SELECT total_capacity_kg, occupied_kg INTO v_loc_capacity, v_loc_occupied
  FROM "public"."get_storage_location_capacity"(p_storage_location_id);
  
  IF v_loc_occupied + v_quantity_kg > v_loc_capacity THEN
    RAISE EXCEPTION 'Storage location capacity exceeded: available=%, requested=%', 
      (v_loc_capacity - v_loc_occupied), v_quantity_kg;
  END IF;
  
  -- Check if inventory record already exists for this location/batch/owner
  SELECT id INTO v_existing_inventory_id
  FROM "public"."inventory"
  WHERE organization_id = p_organization_id
    AND warehouse_id = p_warehouse_id
    AND cold_storage_id = p_cold_storage_id
    AND storage_location_id = p_storage_location_id
    AND product_id = p_product_id
    AND batch_id = p_batch_id
    AND owner_type = p_owner_type
    AND owner_id = p_owner_id
    AND status = 'AVAILABLE'
  LIMIT 1;
  
  IF v_existing_inventory_id IS NOT NULL THEN
    -- Update existing inventory
    UPDATE "public"."inventory"
    SET quantity = quantity + p_quantity,
        quantity_kg = COALESCE(quantity_kg, 0) + COALESCE(p_quantity_kg, 0),
        received_at = COALESCE(received_at, now()),
        updated_at = now()
    WHERE id = v_existing_inventory_id;
    
    v_inventory_id := v_existing_inventory_id;
  ELSE
    -- Create new inventory record
    INSERT INTO "public"."inventory" (
      organization_id, warehouse_id, cold_storage_id, storage_location_id,
      product_id, batch_id, owner_type, owner_id, quantity, unit_id,
      quantity_kg, status, received_at
    ) VALUES (
      p_organization_id, p_warehouse_id, p_cold_storage_id, p_storage_location_id,
      p_product_id, p_batch_id, p_owner_type, p_owner_id, p_quantity, p_unit_id,
      p_quantity_kg, 'AVAILABLE', now()
    )
    RETURNING id INTO v_inventory_id;
  END IF;
  
  -- Generate movement number
  v_movement_number := "public"."generate_movement_number"(p_organization_id, 'RECEIVE');
  
  -- Create movement record
  INSERT INTO "public"."inventory_movements" (
    organization_id, movement_number, movement_type, inventory_id,
    batch_id, product_id, destination_warehouse_id, destination_cold_storage_id,
    destination_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
    reference_number, notes, performed_by, performed_at
  ) VALUES (
    p_organization_id, v_movement_number, 'RECEIVE', v_inventory_id,
    p_batch_id, p_product_id, p_warehouse_id, p_cold_storage_id,
    p_storage_location_id, p_owner_type, p_owner_id, p_quantity, p_unit_id, p_quantity_kg,
    p_reference_number, p_notes, p_performed_by, now()
  )
  RETURNING id INTO v_movement_id;
  
  -- Log to audit
  INSERT INTO "public"."audit_logs" (
    organization_id, actor_user_id, action, entity_type, entity_id,
    new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'RECEIVE', 'inventory', v_inventory_id,
    jsonb_build_object(
      'quantity', p_quantity,
      'quantity_kg', p_quantity_kg,
      'movement_number', v_movement_number,
      'batch_id', p_batch_id,
      'product_id', p_product_id
    )
  );
  
  RETURN QUERY SELECT v_inventory_id, v_movement_id, v_movement_number;
END;
$$;

-- Issue inventory with FEFO
CREATE OR REPLACE FUNCTION "public"."issue_inventory_fefo"(
  p_organization_id uuid,
  p_product_id uuid,
  p_required_quantity numeric,
  p_performed_by uuid,
  p_owner_type text DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_reference_number text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text,
  total_issued numeric,
  movements_json jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_remaining numeric := p_required_quantity;
  v_inventory_rec record;
  v_issue_qty numeric;
  v_movement_id uuid;
  v_movement_number text;
  v_total_issued numeric := 0;
  v_movements jsonb := '[]'::jsonb;
  v_locked_inv record;
BEGIN
  -- Get FEFO inventory for this product with row locking for concurrency
  FOR v_inventory_rec IN 
    SELECT * FROM "public"."get_fefo_inventory"(
      p_organization_id, p_product_id, p_required_quantity,
      p_owner_type, p_owner_id, NULL, NULL
    )
  LOOP
    -- Lock the inventory row for update to prevent race conditions
    SELECT * INTO v_locked_inv FROM "public"."inventory" 
    WHERE id = v_inventory_rec.inventory_id 
    FOR UPDATE NOWAIT;
    IF v_remaining <= 0 THEN
      EXIT;
    END IF;
    
    -- Check if inventory can be issued - REJECT entire operation if non-AVAILABLE
    IF NOT "public"."can_issue_inventory"(v_inventory_rec.inventory_id) THEN
      RAISE EXCEPTION 'Cannot issue inventory %: status must be AVAILABLE', v_inventory_rec.inventory_id;
    END IF;
    
    -- Calculate quantity to issue from this record
    v_issue_qty := LEAST(v_remaining, v_inventory_rec.quantity);
    
    -- Generate movement number
    v_movement_number := "public"."generate_movement_number"(p_organization_id, 'ISSUE');
    
    -- Create movement record
    INSERT INTO "public"."inventory_movements" (
      organization_id, movement_number, movement_type, inventory_id,
      batch_id, product_id, source_warehouse_id, source_cold_storage_id,
      source_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
      reason, notes, reference_number, performed_by
    ) VALUES (
      p_organization_id, v_movement_number, 'ISSUE', v_inventory_rec.inventory_id,
      v_inventory_rec.batch_id, p_product_id, NULL, v_inventory_rec.cold_storage_id,
      v_inventory_rec.storage_location_id, v_inventory_rec.owner_type, v_inventory_rec.owner_id, 
      v_issue_qty, NULL, NULL,
      p_reason, p_notes, p_reference_number, p_performed_by
    )
    RETURNING id INTO v_movement_id;
    
    -- Update inventory quantity
    UPDATE "public"."inventory"
    SET quantity = quantity - v_issue_qty,
        updated_at = now()
    WHERE id = v_inventory_rec.inventory_id;
    
    -- If quantity reaches 0, mark as consumed
    UPDATE "public"."inventory"
    SET status = 'BLOCKED'
    WHERE id = v_inventory_rec.inventory_id
      AND quantity <= 0;
    
    v_total_issued := v_total_issued + v_issue_qty;
    v_remaining := v_remaining - v_issue_qty;
    
    -- Add to movements JSON
    v_movements := v_movements || jsonb_build_array(jsonb_build_object(
      'inventory_id', v_inventory_rec.inventory_id,
      'movement_id', v_movement_id,
      'quantity', v_issue_qty,
      'batch_id', v_inventory_rec.batch_id
    ));
  END LOOP;
  
  -- Log to audit
  INSERT INTO "public"."audit_logs" (
    organization_id, actor_user_id, action, entity_type, entity_id,
    new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'ISSUE', 'inventory', NULL,
    jsonb_build_object(
      'product_id', p_product_id,
      'required_quantity', p_required_quantity,
      'total_issued', v_total_issued,
      'movements', v_movements
    )
  );
  
  RETURN QUERY SELECT 
    CASE WHEN v_total_issued >= p_required_quantity THEN true ELSE false END,
    CASE 
      WHEN v_total_issued >= p_required_quantity THEN 'Issued successfully'
      WHEN v_total_issued > 0 THEN 'Partial issue - insufficient stock'
      ELSE 'No stock available'
    END,
    v_total_issued,
    v_movements;
END;
$$;

-- Transfer inventory between locations
CREATE OR REPLACE FUNCTION "public"."transfer_inventory"(
  p_organization_id uuid,
  p_source_inventory_id uuid,
  p_destination_location_id uuid,
  p_quantity numeric,
  p_performed_by uuid,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text,
  movement_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_source record;
  v_dest_location record;
  v_dest_inventory_id uuid;
  v_transfer_ref uuid;
  v_movement_id_out uuid;
  v_movement_id_in uuid;
  v_movement_number_out text;
  v_movement_number_in text;
BEGIN
  -- Get source inventory details
  SELECT i.*, sl.cold_storage_id as dest_cold_storage_id, w.id as dest_warehouse_id
  INTO v_source
  FROM "public"."inventory" i
  JOIN "public"."storage_locations" sl ON sl.id = p_destination_location_id
  JOIN "public"."cold_storages" cs ON cs.id = sl.cold_storage_id
  JOIN "public"."warehouses" w ON w.id = cs.warehouse_id
  WHERE i.id = p_source_inventory_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Source inventory not found', NULL::uuid;
    RETURN;
  END IF;
  
  IF v_source.quantity < p_quantity THEN
    RETURN QUERY SELECT false, 'Insufficient quantity', NULL::uuid;
    RETURN;
  END IF;
  
  -- Check capacity at destination
  SELECT * INTO v_dest_location
  FROM "public"."get_storage_location_capacity"(p_destination_location_id);
  
  IF v_dest_location.available_kg < (v_source.quantity_kg / v_source.quantity * p_quantity) THEN
    RETURN QUERY SELECT false, 'Destination location capacity exceeded', NULL::uuid;
    RETURN;
  END IF;
  
  -- Generate transfer reference ID to link the two movement records (immutable)
  v_transfer_ref := gen_random_uuid();
  
  -- Generate movement numbers for both movements
  v_movement_number_out := "public"."generate_movement_number"(p_organization_id, 'TRANSFER_OUT');
  v_movement_number_in := "public"."generate_movement_number"(p_organization_id, 'TRANSFER_IN');
  
  -- Create TRANSFER_OUT movement record (immutable - never updated)
  INSERT INTO "public"."inventory_movements" (
    organization_id, movement_number, movement_type, transfer_reference_id,
    inventory_id, batch_id, product_id, source_warehouse_id, source_cold_storage_id,
    source_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
    notes, performed_by
  ) VALUES (
    p_organization_id, v_movement_number_out, 'TRANSFER_OUT', v_transfer_ref, p_source_inventory_id,
    v_source.batch_id, v_source.product_id, v_source.warehouse_id, v_source.cold_storage_id,
    v_source.storage_location_id, v_source.owner_type, v_source.owner_id, p_quantity, v_source.unit_id,
    p_quantity * COALESCE(v_source.quantity_kg / NULLIF(v_source.quantity, 0), 0),
    p_notes, p_performed_by
  )
  RETURNING id INTO v_movement_id_out;
  
  -- Create TRANSFER_IN movement record (immutable - never updated)
  INSERT INTO "public"."inventory_movements" (
    organization_id, movement_number, movement_type, transfer_reference_id,
    batch_id, product_id, destination_warehouse_id, destination_cold_storage_id,
    destination_location_id, owner_type, owner_id, quantity, unit_id, quantity_kg,
    notes, performed_by
  ) VALUES (
    p_organization_id, v_movement_number_in, 'TRANSFER_IN', v_transfer_ref,
    v_source.batch_id, v_source.product_id, v_dest_location.warehouse_id, v_dest_location.cold_storage_id,
    p_destination_location_id, v_source.owner_type, v_source.owner_id, p_quantity, v_source.unit_id,
    p_quantity * COALESCE(v_source.quantity_kg / NULLIF(v_source.quantity, 0), 0),
    p_notes, p_performed_by
  )
  RETURNING id INTO v_movement_id_in;
  
  -- Reduce source quantity
  UPDATE "public"."inventory"
  SET quantity = quantity - p_quantity,
      updated_at = now()
  WHERE id = p_source_inventory_id;
  
  -- Check if destination inventory exists
  SELECT id INTO v_dest_inventory_id
  FROM "public"."inventory"
  WHERE cold_storage_id = v_dest_location.cold_storage_id
    AND storage_location_id = p_destination_location_id
    AND batch_id = v_source.batch_id
    AND owner_type = v_source.owner_type
    AND owner_id = v_source.owner_id
    AND status = 'AVAILABLE';
  
  IF v_dest_inventory_id IS NOT NULL THEN
    -- Add to existing destination inventory
    UPDATE "public"."inventory"
    SET quantity = quantity + p_quantity,
        updated_at = now()
    WHERE id = v_dest_inventory_id;
  ELSE
    -- Create new inventory record at destination
    INSERT INTO "public"."inventory" (
      organization_id, warehouse_id, cold_storage_id, storage_location_id,
      product_id, batch_id, owner_type, owner_id, quantity, unit_id, quantity_kg, status
    ) VALUES (
      p_organization_id, v_dest_location.warehouse_id, v_dest_location.cold_storage_id,
      p_destination_location_id, v_source.product_id, v_source.batch_id,
      v_source.owner_type, v_source.owner_id, p_quantity, v_source.unit_id,
      p_quantity * COALESCE(v_source.quantity_kg / NULLIF(v_source.quantity, 0), 0),
      'AVAILABLE'
    )
    RETURNING id INTO v_dest_inventory_id;
  END IF;
  
  -- NOTE: No UPDATE on movements - transfer creates two immutable records
  -- TRANSFER_OUT and TRANSFER_IN movements are linked by transfer_reference_id
  -- Both records are created atomically and are immutable
  
  -- If source quantity reaches 0, mark as blocked
  UPDATE "public"."inventory"
  SET status = 'BLOCKED'
  WHERE id = p_source_inventory_id
    AND quantity <= 0;
  
  -- Log to audit with transfer reference
  INSERT INTO "public"."audit_logs" (
    organization_id, actor_user_id, action, entity_type, entity_id,
    new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'TRANSFER', 'inventory', v_transfer_ref,
    jsonb_build_object(
      'source_inventory_id', p_source_inventory_id,
      'destination_inventory_id', v_dest_inventory_id,
      'transfer_reference_id', v_transfer_ref,
      'quantity', p_quantity,
      'movement_number_out', v_movement_number_out,
      'movement_number_in', v_movement_number_in
    )
  );
  
  RETURN QUERY SELECT true, 'Transfer completed successfully', v_transfer_ref;
END;
$$;

-- ============================================
-- VIEWS FOR COMMON QUERIES
-- ============================================

-- Current inventory summary view
CREATE OR REPLACE VIEW "public"."inventory_summary" AS
SELECT 
  i.organization_id,
  i.warehouse_id,
  w.code as warehouse_code,
  w.name as warehouse_name,
  i.cold_storage_id,
  cs.code as cold_storage_code,
  cs.name as cold_storage_name,
  i.storage_location_id,
  sl.code as location_code,
  sl.name as location_name,
  i.product_id,
  p.sku,
  p.name as product_name,
  i.batch_id,
  b.batch_number,
  b.expiry_date,
  i.owner_type,
  i.owner_id,
  CASE 
    WHEN i.owner_type = 'COMPANY' THEN 'Company Owned'
    ELSE c.name
  END as owner_name,
  i.quantity,
  u.code as unit_code,
  i.quantity_kg,
  i.status,
  i.received_at
FROM "public"."inventory" i
JOIN "public"."warehouses" w ON w.id = i.warehouse_id
JOIN "public"."cold_storages" cs ON cs.id = i.cold_storage_id
JOIN "public"."storage_locations" sl ON sl.id = i.storage_location_id
JOIN "public"."products" p ON p.id = i.product_id
JOIN "public"."batches" b ON b.id = i.batch_id
JOIN "public"."units" u ON u.id = i.unit_id
LEFT JOIN "public"."customers" c ON c.id = i.owner_id AND i.owner_type = 'CUSTOMER'
WHERE i.status != 'BLOCKED' OR i.quantity > 0;
