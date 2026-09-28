-- Migration: 005_rental_domain.sql
-- Description: Cold Storage Rental Engine - contracts, rates, allocations, movements, charges, invoices
-- Date: 2026-09-26

-- ============================================
-- TABLES
-- ============================================

-- ============================================
-- RENTAL CONTRACTS
-- Master agreement between company and customer
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."rental_contracts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "contract_number" text NOT NULL,
    "customer_id" uuid NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date,
    "billing_frequency" text DEFAULT 'MONTHLY'::text NOT NULL,
    "payment_terms_days" integer DEFAULT 30,
    "notes" text,
    "terms_and_conditions" text,
    "approval_request_id" uuid,
    "created_by" uuid NOT NULL,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "rental_contracts_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'COMPLETED'::text, 'CANCELLED'::text])),
    CONSTRAINT "rental_contracts_billing_frequency_check" CHECK (billing_frequency = ANY (ARRAY['DAILY'::text, 'WEEKLY'::text, 'MONTHLY'::text, 'QUARTERLY'::text])),
    CONSTRAINT "rental_contracts_date_check" CHECK (end_date IS NULL OR end_date >= start_date)
);

ALTER TABLE "public"."rental_contracts" OWNER TO "postgres";

-- ============================================
-- RENTAL RATES
-- Configurable pricing by customer/storage/product
-- Rate Priority (lowest to highest):
-- 1. standard_rate (fallback)
-- 2. category_rate (product category specific)
-- 3. storage_rate (cold storage specific)
-- 4. customer_rate (customer specific)
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."rental_rates" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "rate_number" text NOT NULL,
    "rate_type" text DEFAULT 'STANDARD'::text NOT NULL,
    -- Which entities this rate applies to
    "customer_id" uuid,
    "cold_storage_id" uuid,
    "storage_location_id" uuid,
    "product_category_id" uuid,
    "product_id" uuid,
    -- Rate configuration
    "rate_per_kg_day" numeric(12,2) NOT NULL,
    "currency" text DEFAULT 'IDR'::text NOT NULL,
    "minimum_quantity_kg" numeric(14,3) DEFAULT 0,
    "minimum_days" integer DEFAULT 0,
    "discount_percentage" numeric(5,2) DEFAULT 0,
    -- Validity
    "effective_from" date NOT NULL,
    "effective_to" date,
    -- Status and approval
    "status" text DEFAULT 'ACTIVE'::text NOT NULL,
    "approval_request_id" uuid,
    "notes" text,
    "created_by" uuid NOT NULL,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "rental_rates_rate_type_check" CHECK (rate_type = ANY (ARRAY['STANDARD'::text, 'CUSTOMER'::text, 'STORAGE'::text, 'LOCATION'::text, 'CATEGORY'::text, 'PRODUCT'::text])),
    CONSTRAINT "rental_rates_status_check" CHECK (status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text, 'PENDING_APPROVAL'::text])),
    CONSTRAINT "rental_rates_discount_check" CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
    CONSTRAINT "rental_rates_rate_check" CHECK (rate_per_kg_day >= 0)
);

ALTER TABLE "public"."rental_rates" OWNER TO "postgres";

-- ============================================
-- RENTAL ALLOCATIONS
-- Bridge between customer, contract, and physical inventory
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."rental_allocations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "allocation_number" text NOT NULL,
    "contract_id" uuid NOT NULL,
    "customer_id" uuid NOT NULL,
    "inventory_id" uuid NOT NULL,
    "batch_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "warehouse_id" uuid NOT NULL,
    "cold_storage_id" uuid NOT NULL,
    "storage_location_id" uuid NOT NULL,
    "allocated_quantity" numeric(14,3) NOT NULL,
    "allocated_quantity_kg" numeric(14,3) NOT NULL,
    "active_quantity_kg" numeric(14,3) NOT NULL,
    "released_quantity_kg" numeric(14,3) DEFAULT 0,
    "status" text DEFAULT 'ACTIVE'::text NOT NULL,
    "allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "released_at" timestamp with time zone,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "rental_allocations_status_check" CHECK (status = ANY (ARRAY['ACTIVE'::text, 'PARTIALLY_RELEASED'::text, 'RELEASED'::text, 'TRANSFERRED'::text])),
    CONSTRAINT "rental_allocations_quantity_check" CHECK (active_quantity_kg >= 0 AND active_quantity_kg <= allocated_quantity_kg),
    CONSTRAINT "rental_allocations_released_check" CHECK (released_quantity_kg >= 0 AND released_quantity_kg <= allocated_quantity_kg)
);

ALTER TABLE "public"."rental_allocations" OWNER TO "postgres";

-- ============================================
-- RENTAL STOCK MOVEMENTS (APPEND-ONLY LEDGER)
-- Immutable audit trail for rental stock changes
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."rental_stock_movements" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "movement_number" text NOT NULL,
    "movement_type" text NOT NULL,
    "allocation_id" uuid NOT NULL,
    "contract_id" uuid NOT NULL,
    "customer_id" uuid NOT NULL,
    "inventory_id" uuid NOT NULL,
    "batch_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "source_warehouse_id" uuid,
    "source_cold_storage_id" uuid,
    "source_location_id" uuid,
    "destination_warehouse_id" uuid,
    "destination_cold_storage_id" uuid,
    "destination_location_id" uuid,
    "quantity" numeric(14,3) NOT NULL,
    "quantity_kg" numeric(14,3) NOT NULL,
    "rate_id" uuid,
    "rate_per_kg_day" numeric(12,2),
    "reason" text,
    "notes" text,
    "reference_number" text,
    "transfer_reference_id" uuid,
    "performed_by" uuid NOT NULL,
    "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "rental_movements_type_check" CHECK (movement_type = ANY (ARRAY['RECEIVE'::text, 'RELEASE'::text, 'TRANSFER_OUT'::text, 'TRANSFER_IN'::text, 'ADJUSTMENT'::text, 'DAMAGE'::text, 'EXPIRY'::text])),
    CONSTRAINT "rental_movements_quantity_check" CHECK (quantity > 0)
);

ALTER TABLE "public"."rental_stock_movements" OWNER TO "postgres";

-- ============================================
-- RENTAL CHARGES (IMMUTABLE BILLING LEDGER)
-- Historical snapshot of billing calculations
-- NEVER updated after creation
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."rental_charges" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "charge_number" text NOT NULL,
    "contract_id" uuid NOT NULL,
    "allocation_id" uuid NOT NULL,
    "customer_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "cold_storage_id" uuid NOT NULL,
    "storage_location_id" uuid,
    -- Billing period
    "billing_start" date NOT NULL,
    "billing_end" date NOT NULL,
    -- Quantity snapshot (historical)
    "quantity_kg_start" numeric(14,3) NOT NULL,
    "quantity_kg_end" numeric(14,3) NOT NULL,
    "quantity_kg_average" numeric(14,3) NOT NULL,
    "days_billed" numeric(5,2) NOT NULL,
    -- Rate snapshot (historical - never changes)
    "rate_id" uuid NOT NULL,
    "rate_per_kg_day" numeric(12,2) NOT NULL,
    "discount_percentage" numeric(5,2) DEFAULT 0,
    "effective_rate_per_kg_day" numeric(12,2) NOT NULL,
    -- Amount
    "subtotal" numeric(14,2) NOT NULL,
    "discount_amount" numeric(14,2) DEFAULT 0,
    "tax_percentage" numeric(5,2) DEFAULT 0,
    "tax_amount" numeric(14,2) DEFAULT 0,
    "total_amount" numeric(14,2) NOT NULL,
    "currency" text DEFAULT 'IDR'::text NOT NULL,
    -- Metadata
    "calculation_notes" text,
    "invoice_line_id" uuid,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "rental_charges_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'INVOICED'::text, 'WAIVED'::text])),
    CONSTRAINT "rental_charges_positive_check" CHECK (total_amount >= 0)
);

ALTER TABLE "public"."rental_charges" OWNER TO "postgres";

-- ============================================
-- RENTAL INVOICES
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."rental_invoices" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "invoice_number" text NOT NULL,
    "contract_id" uuid NOT NULL,
    "customer_id" uuid NOT NULL,
    "billing_period_start" date NOT NULL,
    "billing_period_end" date NOT NULL,
    "issue_date" date NOT NULL,
    "due_date" date NOT NULL,
    "subtotal" numeric(14,2) NOT NULL,
    "tax_percentage" numeric(5,2) DEFAULT 0,
    "tax_amount" numeric(14,2) DEFAULT 0,
    "total_amount" numeric(14,2) NOT NULL,
    "amount_paid" numeric(14,2) DEFAULT 0,
    "currency" text DEFAULT 'IDR'::text NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "notes" text,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "rental_invoices_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'ISSUED'::text, 'SENT'::text, 'PARTIALLY_PAID'::text, 'PAID'::text, 'OVERDUE'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."rental_invoices" OWNER TO "postgres";

-- ============================================
-- RENTAL INVOICE LINES
-- Preserves historical charge snapshot
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."rental_invoice_lines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "invoice_id" uuid NOT NULL,
    "charge_id" uuid NOT NULL,
    "line_number" integer NOT NULL,
    -- Product info
    "product_id" uuid NOT NULL,
    "product_name" text NOT NULL,
    "product_sku" text,
    -- Storage location
    "cold_storage_name" text,
    "storage_location_name" text,
    -- Billing details
    "quantity_kg_average" numeric(14,3) NOT NULL,
    "days_billed" numeric(5,2) NOT NULL,
    "rate_per_kg_day" numeric(12,2) NOT NULL,
    "discount_percentage" numeric(5,2) DEFAULT 0,
    -- Amounts
    "subtotal" numeric(14,2) NOT NULL,
    "discount_amount" numeric(14,2) DEFAULT 0,
    "tax_percentage" numeric(5,2) DEFAULT 0,
    "tax_amount" numeric(14,2) DEFAULT 0,
    "line_total" numeric(14,2) NOT NULL,
    "currency" text DEFAULT 'IDR'::text NOT NULL,
    -- Metadata snapshot
    "billing_start" date NOT NULL,
    "billing_end" date NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."rental_invoice_lines" OWNER TO "postgres";

-- ============================================
-- RENTAL QUANTITY TIMELINE (for billing accuracy)
-- Tracks quantity changes over time per allocation
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."rental_quantity_snapshots" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "allocation_id" uuid NOT NULL,
    "snapshot_date" date NOT NULL,
    "quantity_kg" numeric(14,3) NOT NULL,
    "reason" text NOT NULL,
    "reference_id" uuid,
    "reference_type" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "rental_quantity_snapshots_unique" UNIQUE ("allocation_id", "snapshot_date")
);

ALTER TABLE "public"."rental_quantity_snapshots" OWNER TO "postgres";



-- ============================================
-- INDEXES
-- ============================================

-- Rental contracts indexes
CREATE INDEX IF NOT EXISTS "idx_rental_contracts_org" ON "public"."rental_contracts" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_rental_contracts_customer" ON "public"."rental_contracts" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_rental_contracts_status" ON "public"."rental_contracts" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_rental_contracts_number" ON "public"."rental_contracts" USING btree ("contract_number");
CREATE INDEX IF NOT EXISTS "idx_rental_contracts_dates" ON "public"."rental_contracts" USING btree ("start_date", "end_date");

-- Rental rates indexes
CREATE INDEX IF NOT EXISTS "idx_rental_rates_org" ON "public"."rental_rates" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_rental_rates_customer" ON "public"."rental_rates" USING btree ("customer_id") WHERE "customer_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_rental_rates_storage" ON "public"."rental_rates" USING btree ("cold_storage_id") WHERE "cold_storage_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_rental_rates_product" ON "public"."rental_rates" USING btree ("product_id") WHERE "product_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_rental_rates_effective" ON "public"."rental_rates" USING btree ("effective_from", "effective_to");

-- Rental allocations indexes
CREATE INDEX IF NOT EXISTS "idx_rental_allocations_org" ON "public"."rental_allocations" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_rental_allocations_contract" ON "public"."rental_allocations" USING btree ("contract_id");
CREATE INDEX IF NOT EXISTS "idx_rental_allocations_customer" ON "public"."rental_allocations" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_rental_allocations_inventory" ON "public"."rental_allocations" USING btree ("inventory_id");
CREATE INDEX IF NOT EXISTS "idx_rental_allocations_storage" ON "public"."rental_allocations" USING btree ("cold_storage_id");
CREATE INDEX IF NOT EXISTS "idx_rental_allocations_status" ON "public"."rental_allocations" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_rental_allocations_active" ON "public"."rental_allocations" USING btree ("status") WHERE "status" IN ('ACTIVE', 'PARTIALLY_RELEASED');

-- Rental movements indexes
CREATE INDEX IF NOT EXISTS "idx_rental_movements_org" ON "public"."rental_stock_movements" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_rental_movements_number" ON "public"."rental_stock_movements" USING btree ("movement_number");
CREATE INDEX IF NOT EXISTS "idx_rental_movements_type" ON "public"."rental_stock_movements" USING btree ("movement_type");
CREATE INDEX IF NOT EXISTS "idx_rental_movements_allocation" ON "public"."rental_stock_movements" USING btree ("allocation_id");
CREATE INDEX IF NOT EXISTS "idx_rental_movements_contract" ON "public"."rental_stock_movements" USING btree ("contract_id");
CREATE INDEX IF NOT EXISTS "idx_rental_movements_customer" ON "public"."rental_stock_movements" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_rental_movements_performed" ON "public"."rental_stock_movements" USING btree ("performed_at");

-- Rental charges indexes
CREATE INDEX IF NOT EXISTS "idx_rental_charges_org" ON "public"."rental_charges" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_rental_charges_contract" ON "public"."rental_charges" USING btree ("contract_id");
CREATE INDEX IF NOT EXISTS "idx_rental_charges_allocation" ON "public"."rental_charges" USING btree ("allocation_id");
CREATE INDEX IF NOT EXISTS "idx_rental_charges_customer" ON "public"."rental_charges" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_rental_charges_billing" ON "public"."rental_charges" USING btree ("billing_start", "billing_end");
CREATE INDEX IF NOT EXISTS "idx_rental_charges_status" ON "public"."rental_charges" USING btree ("status");

-- Rental invoices indexes
CREATE INDEX IF NOT EXISTS "idx_rental_invoices_org" ON "public"."rental_invoices" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_rental_invoices_number" ON "public"."rental_invoices" USING btree ("invoice_number");
CREATE INDEX IF NOT EXISTS "idx_rental_invoices_contract" ON "public"."rental_invoices" USING btree ("contract_id");
CREATE INDEX IF NOT EXISTS "idx_rental_invoices_customer" ON "public"."rental_invoices" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_rental_invoices_status" ON "public"."rental_invoices" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_rental_invoices_due" ON "public"."rental_invoices" USING btree ("due_date");

-- Rental invoice lines indexes
CREATE INDEX IF NOT EXISTS "idx_rental_invoice_lines_invoice" ON "public"."rental_invoice_lines" USING btree ("invoice_id");
CREATE INDEX IF NOT EXISTS "idx_rental_invoice_lines_charge" ON "public"."rental_invoice_lines" USING btree ("charge_id");

-- Quantity snapshots indexes
CREATE INDEX IF NOT EXISTS "idx_rental_quantity_snapshots_allocation" ON "public"."rental_quantity_snapshots" USING btree ("allocation_id");
CREATE INDEX IF NOT EXISTS "idx_rental_quantity_snapshots_date" ON "public"."rental_quantity_snapshots" USING btree ("snapshot_date");

-- ============================================
-- FOREIGN KEYS
-- ============================================

-- Rental contracts FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_contracts"::regclass AND conname = "rental_contracts_org_fkey"
  ) THEN
    ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_contracts"::regclass AND conname = "rental_contracts_customer_fkey"
  ) THEN
    ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_contracts"::regclass AND conname = "rental_contracts_approval_fkey"
  ) THEN
    ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_approval_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_contracts"::regclass AND conname = "rental_contracts_created_by_fkey"
  ) THEN
    ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_contracts"::regclass AND conname = "rental_contracts_approved_by_fkey"
  ) THEN
    ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;


-- Rental rates FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_rates"::regclass AND conname = "rental_rates_org_fkey"
  ) THEN
    ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_rates"::regclass AND conname = "rental_rates_customer_fkey"
  ) THEN
    ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_rates"::regclass AND conname = "rental_rates_storage_fkey"
  ) THEN
    ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_storage_fkey" FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_rates"::regclass AND conname = "rental_rates_location_fkey"
  ) THEN
    ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_location_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "public"."storage_locations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_rates"::regclass AND conname = "rental_rates_category_fkey"
  ) THEN
    ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_category_fkey" FOREIGN KEY ("product_category_id") REFERENCES "public"."product_categories" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_rates"::regclass AND conname = "rental_rates_product_fkey"
  ) THEN
    ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_product_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_rates"::regclass AND conname = "rental_rates_approval_fkey"
  ) THEN
    ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_approval_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_rates"::regclass AND conname = "rental_rates_created_by_fkey"
  ) THEN
    ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_rates"::regclass AND conname = "rental_rates_approved_by_fkey"
  ) THEN
    ALTER TABLE "rental_rates" ADD CONSTRAINT "rental_rates_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;


-- Rental allocations FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_allocations"::regclass AND conname = "rental_allocations_org_fkey"
  ) THEN
    ALTER TABLE "rental_allocations" ADD CONSTRAINT "rental_allocations_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_allocations"::regclass AND conname = "rental_allocations_contract_fkey"
  ) THEN
    ALTER TABLE "rental_allocations" ADD CONSTRAINT "rental_allocations_contract_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_allocations"::regclass AND conname = "rental_allocations_customer_fkey"
  ) THEN
    ALTER TABLE "rental_allocations" ADD CONSTRAINT "rental_allocations_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_allocations"::regclass AND conname = "rental_allocations_inventory_fkey"
  ) THEN
    ALTER TABLE "rental_allocations" ADD CONSTRAINT "rental_allocations_inventory_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_allocations"::regclass AND conname = "rental_allocations_batch_fkey"
  ) THEN
    ALTER TABLE "rental_allocations" ADD CONSTRAINT "rental_allocations_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_allocations"::regclass AND conname = "rental_allocations_product_fkey"
  ) THEN
    ALTER TABLE "rental_allocations" ADD CONSTRAINT "rental_allocations_product_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_allocations"::regclass AND conname = "rental_allocations_warehouse_fkey"
  ) THEN
    ALTER TABLE "rental_allocations" ADD CONSTRAINT "rental_allocations_warehouse_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_allocations"::regclass AND conname = "rental_allocations_storage_fkey"
  ) THEN
    ALTER TABLE "rental_allocations" ADD CONSTRAINT "rental_allocations_storage_fkey" FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_allocations"::regclass AND conname = "rental_allocations_location_fkey"
  ) THEN
    ALTER TABLE "rental_allocations" ADD CONSTRAINT "rental_allocations_location_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "public"."storage_locations" ("id");
  END IF;
END;
$$;


-- Rental movements FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_stock_movements"::regclass AND conname = "rental_movements_org_fkey"
  ) THEN
    ALTER TABLE "rental_stock_movements" ADD CONSTRAINT "rental_movements_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_stock_movements"::regclass AND conname = "rental_movements_allocation_fkey"
  ) THEN
    ALTER TABLE "rental_stock_movements" ADD CONSTRAINT "rental_movements_allocation_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."rental_allocations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_stock_movements"::regclass AND conname = "rental_movements_contract_fkey"
  ) THEN
    ALTER TABLE "rental_stock_movements" ADD CONSTRAINT "rental_movements_contract_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_stock_movements"::regclass AND conname = "rental_movements_customer_fkey"
  ) THEN
    ALTER TABLE "rental_stock_movements" ADD CONSTRAINT "rental_movements_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_stock_movements"::regclass AND conname = "rental_movements_inventory_fkey"
  ) THEN
    ALTER TABLE "rental_stock_movements" ADD CONSTRAINT "rental_movements_inventory_fkey" FOREIGN KEY ("inventory_id") REFERENCES "public"."inventory" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_stock_movements"::regclass AND conname = "rental_movements_batch_fkey"
  ) THEN
    ALTER TABLE "rental_stock_movements" ADD CONSTRAINT "rental_movements_batch_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_stock_movements"::regclass AND conname = "rental_movements_product_fkey"
  ) THEN
    ALTER TABLE "rental_stock_movements" ADD CONSTRAINT "rental_movements_product_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_stock_movements"::regclass AND conname = "rental_movements_rate_fkey"
  ) THEN
    ALTER TABLE "rental_stock_movements" ADD CONSTRAINT "rental_movements_rate_fkey" FOREIGN KEY ("rate_id") REFERENCES "public"."rental_rates" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_stock_movements"::regclass AND conname = "rental_movements_performed_by_fkey"
  ) THEN
    ALTER TABLE "rental_stock_movements" ADD CONSTRAINT "rental_movements_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;


-- Rental charges FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_charges"::regclass AND conname = "rental_charges_org_fkey"
  ) THEN
    ALTER TABLE "rental_charges" ADD CONSTRAINT "rental_charges_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_charges"::regclass AND conname = "rental_charges_contract_fkey"
  ) THEN
    ALTER TABLE "rental_charges" ADD CONSTRAINT "rental_charges_contract_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_charges"::regclass AND conname = "rental_charges_allocation_fkey"
  ) THEN
    ALTER TABLE "rental_charges" ADD CONSTRAINT "rental_charges_allocation_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."rental_allocations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_charges"::regclass AND conname = "rental_charges_customer_fkey"
  ) THEN
    ALTER TABLE "rental_charges" ADD CONSTRAINT "rental_charges_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_charges"::regclass AND conname = "rental_charges_product_fkey"
  ) THEN
    ALTER TABLE "rental_charges" ADD CONSTRAINT "rental_charges_product_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_charges"::regclass AND conname = "rental_charges_storage_fkey"
  ) THEN
    ALTER TABLE "rental_charges" ADD CONSTRAINT "rental_charges_storage_fkey" FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_charges"::regclass AND conname = "rental_charges_rate_fkey"
  ) THEN
    ALTER TABLE "rental_charges" ADD CONSTRAINT "rental_charges_rate_fkey" FOREIGN KEY ("rate_id") REFERENCES "public"."rental_rates" ("id");
  END IF;
END;
$$;


-- Rental invoices FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_invoices"::regclass AND conname = "rental_invoices_org_fkey"
  ) THEN
    ALTER TABLE "rental_invoices" ADD CONSTRAINT "rental_invoices_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_invoices"::regclass AND conname = "rental_invoices_contract_fkey"
  ) THEN
    ALTER TABLE "rental_invoices" ADD CONSTRAINT "rental_invoices_contract_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_invoices"::regclass AND conname = "rental_invoices_customer_fkey"
  ) THEN
    ALTER TABLE "rental_invoices" ADD CONSTRAINT "rental_invoices_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_invoices"::regclass AND conname = "rental_invoices_created_by_fkey"
  ) THEN
    ALTER TABLE "rental_invoices" ADD CONSTRAINT "rental_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;


-- Rental invoice lines FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_invoice_lines"::regclass AND conname = "rental_invoice_lines_invoice_fkey"
  ) THEN
    ALTER TABLE "rental_invoice_lines" ADD CONSTRAINT "rental_invoice_lines_invoice_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."rental_invoices" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_invoice_lines"::regclass AND conname = "rental_invoice_lines_charge_fkey"
  ) THEN
    ALTER TABLE "rental_invoice_lines" ADD CONSTRAINT "rental_invoice_lines_charge_fkey" FOREIGN KEY ("charge_id") REFERENCES "public"."rental_charges" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_invoice_lines"::regclass AND conname = "rental_invoice_lines_product_fkey"
  ) THEN
    ALTER TABLE "rental_invoice_lines" ADD CONSTRAINT "rental_invoice_lines_product_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;


-- Quantity snapshots FKs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = "rental_quantity_snapshots"::regclass AND conname = "rental_quantity_snapshots_allocation_fkey"
  ) THEN
    ALTER TABLE "rental_quantity_snapshots" ADD CONSTRAINT "rental_quantity_snapshots_allocation_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."rental_allocations" ("id");
  END IF;
END;
$$;




-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

DROP TRIGGER IF EXISTS "rental_contracts_updated_at" ON "public"."rental_contracts";
CREATE TRIGGER IF NOT EXISTS "rental_contracts_updated_at"
    BEFORE UPDATE ON "public"."rental_contracts"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "rental_rates_updated_at" ON "public"."rental_rates";
CREATE TRIGGER IF NOT EXISTS "rental_rates_updated_at"
    BEFORE UPDATE ON "public"."rental_rates"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "rental_allocations_updated_at" ON "public"."rental_allocations";
CREATE TRIGGER IF NOT EXISTS "rental_allocations_updated_at"
    BEFORE UPDATE ON "public"."rental_allocations"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "rental_invoices_updated_at" ON "public"."rental_invoices";
CREATE TRIGGER IF NOT EXISTS "rental_invoices_updated_at"
    BEFORE UPDATE ON "public"."rental_invoices"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE "public"."rental_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rental_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rental_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rental_stock_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rental_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rental_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rental_invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."rental_quantity_snapshots" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Rental contracts policies
CREATE POLICY "rental_contracts_select" ON "public"."rental_contracts" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "rental_contracts_insert" ON "public"."rental_contracts" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'rental.manage'::text));
CREATE POLICY "rental_contracts_update" ON "public"."rental_contracts" FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'rental.manage'::text));

-- Rental rates policies
CREATE POLICY "rental_rates_select" ON "public"."rental_rates" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "rental_rates_insert" ON "public"."rental_rates" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'rental.rate.manage'::text));
CREATE POLICY "rental_rates_update" ON "public"."rental_rates" FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'rental.rate.manage'::text));

-- Rental allocations policies
CREATE POLICY "rental_allocations_select" ON "public"."rental_allocations" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "rental_allocations_insert" ON "public"."rental_allocations" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'rental.receive'::text));
CREATE POLICY "rental_allocations_update" ON "public"."rental_allocations" FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'rental.release'::text));

-- Rental movements policies (append-only)
CREATE POLICY "rental_movements_select" ON "public"."rental_stock_movements" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "rental_movements_insert" ON "public"."rental_stock_movements" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'rental.manage'::text));

-- Rental charges policies (append-only - no updates)
CREATE POLICY "rental_charges_select" ON "public"."rental_charges" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "rental_charges_insert" ON "public"."rental_charges" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'rental.billing'::text));

-- Rental invoices policies
CREATE POLICY "rental_invoices_select" ON "public"."rental_invoices" FOR SELECT USING ("public"."is_org_member"("organization_id"));
CREATE POLICY "rental_invoices_insert" ON "public"."rental_invoices" FOR INSERT WITH CHECK ("public"."has_org_permission"("organization_id", 'rental.billing'::text));
CREATE POLICY "rental_invoices_update" ON "public"."rental_invoices" FOR UPDATE USING ("public"."has_org_permission"("organization_id", 'rental.billing'::text));

-- Rental invoice lines policies
CREATE POLICY "rental_invoice_lines_select" ON "public"."rental_invoice_lines" FOR SELECT USING (
    EXISTS (SELECT 1 FROM "public"."rental_invoices" ri WHERE ri."id" = "rental_invoice_lines"."invoice_id" AND "public"."is_org_member"(ri."organization_id"))
);
CREATE POLICY "rental_invoice_lines_insert" ON "public"."rental_invoice_lines" FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "public"."rental_invoices" ri WHERE ri."id" = "rental_invoice_lines"."invoice_id" AND "public"."has_org_permission"(ri."organization_id", 'rental.billing'::text))
);

-- Quantity snapshots policies
CREATE POLICY "rental_quantity_snapshots_select" ON "public"."rental_quantity_snapshots" FOR SELECT USING (
    EXISTS (SELECT 1 FROM "public"."rental_allocations" ra WHERE ra."id" = "rental_quantity_snapshots"."allocation_id" AND "public"."is_org_member"(ra."organization_id"))
);
CREATE POLICY "rental_quantity_snapshots_insert" ON "public"."rental_quantity_snapshots" FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM "public"."rental_allocations" ra WHERE ra."id" = "rental_quantity_snapshots"."allocation_id" AND "public"."has_org_permission"(ra."organization_id", 'rental.manage'::text))
);



-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Generate rental contract number
CREATE OR REPLACE FUNCTION "public"."generate_contract_number"(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_seq int;
  v_year text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(rc.contract_number FROM 5 FOR 4) AS int)
  ), 0) + 1
  INTO v_seq
  FROM "public"."rental_contracts" rc
  WHERE rc.organization_id = p_org_id
    AND rc.contract_number LIKE 'CNT-' || v_year || '-%';
  
  RETURN 'CNT-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$$;

-- Generate rental rate number
CREATE OR REPLACE FUNCTION "public"."generate_rate_number"(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_seq int;
  v_year text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(rr.rate_number FROM 5 FOR 4) AS int)
  ), 0) + 1
  INTO v_seq
  FROM "public"."rental_rates" rr
  WHERE rr.organization_id = p_org_id
    AND rr.rate_number LIKE 'RTR-' || v_year || '-%';
  
  RETURN 'RTR-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$$;

-- Generate rental allocation number
CREATE OR REPLACE FUNCTION "public"."generate_allocation_number"(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_seq int;
  v_year text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(ra.allocation_number FROM 5 FOR 4) AS int)
  ), 0) + 1
  INTO v_seq
  FROM "public"."rental_allocations" ra
  WHERE ra.organization_id = p_org_id
    AND ra.allocation_number LIKE 'ALL-' || v_year || '-%';
  
  RETURN 'ALL-' || v_year || '-' || LPAD(v_seq::text, 4, '0');
END;
$$;

-- Generate rental movement number
CREATE OR REPLACE FUNCTION "public"."generate_rental_movement_number"(p_org_id uuid,
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
    WHEN 'RECEIVE' THEN v_prefix := 'RRCV';
    WHEN 'RELEASE' THEN v_prefix := 'RREL';
    WHEN 'TRANSFER_OUT' THEN v_prefix := 'RTRO';
    WHEN 'TRANSFER_IN' THEN v_prefix := 'RTRI';
    WHEN 'ADJUSTMENT' THEN v_prefix := 'RADJ';
    WHEN 'DAMAGE' THEN v_prefix := 'RDMG';
    WHEN 'EXPIRY' THEN v_prefix := 'REXP';
    ELSE v_prefix := 'RMVT';
  END CASE;
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(rsm.movement_number FROM 6 FOR 6) AS int)
  ), 0) + 1
  INTO v_seq
  FROM "public"."rental_stock_movements" rsm
  WHERE rsm.organization_id = p_org_id
    AND rsm.movement_number LIKE v_prefix || '-' || v_year || '-%';
  
  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_seq::text, 6, '0');
END;
$$;

-- Generate charge number
CREATE OR REPLACE FUNCTION "public"."generate_charge_number"(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_seq int;
  v_year text;
  v_month text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');
  v_month := TO_CHAR(CURRENT_DATE, 'MM');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(rc.charge_number FROM 10 FOR 6) AS int)
  ), 0) + 1
  INTO v_seq
  FROM "public"."rental_charges" rc
  WHERE rc.organization_id = p_org_id
    AND rc.charge_number LIKE 'CHG-' || v_year || v_month || '-%';
  
  RETURN 'CHG-' || v_year || v_month || '-' || LPAD(v_seq::text, 6, '0');
END;
$$;

-- Generate invoice number
CREATE OR REPLACE FUNCTION "public"."generate_invoice_number"(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_seq int;
  v_year text;
  v_month text;
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YY');
  v_month := TO_CHAR(CURRENT_DATE, 'MM');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(ri.invoice_number FROM 10 FOR 6) AS int)
  ), 0) + 1
  INTO v_seq
  FROM "public"."rental_invoices" ri
  WHERE ri.organization_id = p_org_id
    AND ri.invoice_number LIKE 'INV-' || v_year || v_month || '-%';
  
  RETURN 'INV-' || v_year || v_month || '-' || LPAD(v_seq::text, 6, '0');
END;
$$;

-- Get applicable rental rate for a customer/product/storage
-- Rate Priority: CUSTOMER > STORAGE > LOCATION > CATEGORY > PRODUCT > STANDARD
CREATE OR REPLACE FUNCTION "public"."get_applicable_rental_rate"(
  p_organization_id uuid,
  p_customer_id uuid,
  p_product_id uuid,
  p_cold_storage_id uuid,
  p_storage_location_id uuid,
  p_effective_date date DEFAULT CURRENT_DATE
))
RETURNS TABLE (
  rate_id uuid,
  rate_type text,
  rate_per_kg_day numeric,
  discount_percentage numeric,
  effective_rate_per_kg_day numeric
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Priority 1: Customer-specific rate
  RETURN QUERY
  SELECT rr.id, rr.rate_type, rr.rate_per_kg_day, rr.discount_percentage,
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) as effective_rate
  FROM "public"."rental_rates" rr
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
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) as effective_rate
  FROM "public"."rental_rates" rr
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
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) as effective_rate
  FROM "public"."rental_rates" rr
  WHERE rr.organization_id = p_organization_id
    AND rr.storage_location_id = p_storage_location_id
    AND rr.customer_id IS NULL
    AND rr.status = 'ACTIVE'
    AND rr.effective_from <= p_effective_date
    AND (rr.effective_to IS NULL OR rr.effective_to >= p_effective_date)
  LIMIT 1;
  
  IF FOUND THEN RETURN; END IF;
  
  -- Priority 4: Product category rate
  RETURN QUERY
  SELECT rr.id, rr.rate_type, rr.rate_per_kg_day, rr.discount_percentage,
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) as effective_rate
  FROM "public"."rental_rates" rr
  JOIN "public"."products" p ON p.product_category_id = rr.product_category_id
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
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) as effective_rate
  FROM "public"."rental_rates" rr
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
         rr.rate_per_kg_day * (1 - rr.discount_percentage / 100) as effective_rate
  FROM "public"."rental_rates" rr
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
$$;

-- Get rental customer inventory by cold storage
CREATE OR REPLACE FUNCTION "public"."get_rental_customer_inventory"(
  p_organization_id uuid,
  p_cold_storage_id uuid DEFAULT NULL
)
RETURNS TABLE (
  cold_storage_id uuid,
  cold_storage_name text,
  total_quantity_kg numeric,
  active_allocations int,
  customer_count int
)
LANGUAGE sql
STABLE
AS $$
SELECT 
  ra.cold_storage_id,
  cs.name as cold_storage_name,
  SUM(ra.active_quantity_kg) as total_quantity_kg,
  COUNT(*) FILTER (WHERE ra.status IN ('ACTIVE', 'PARTIALLY_RELEASED')) as active_allocations,
  COUNT(DISTINCT ra.customer_id) as customer_count
FROM "public"."rental_allocations" ra
JOIN "public"."cold_storages" cs ON cs.id = ra.cold_storage_id
WHERE ra.organization_id = p_organization_id
  AND ra.status IN ('ACTIVE', 'PARTIALLY_RELEASED')
  AND (p_cold_storage_id IS NULL OR ra.cold_storage_id = p_cold_storage_id)
GROUP BY ra.cold_storage_id, cs.name;
$$;



-- ============================================
-- RPC FUNCTIONS FOR ATOMIC OPERATIONS
-- ============================================

-- ============================================
-- RENTAL RECEIVING
-- Creates: customer inventory + rental allocation + movement
-- ============================================
CREATE OR REPLACE FUNCTION "public"."receive_rental_stock"(
  p_organization_id uuid,
  p_contract_id uuid,
  p_customer_id uuid,
  p_product_id uuid,
  p_batch_id uuid,
  p_cold_storage_id uuid,
  p_storage_location_id uuid,
  p_quantity numeric,
  p_quantity_kg numeric,
  p_unit_id uuid,
  p_performed_by uuid,
  p_reference_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  inventory_id uuid,
  allocation_id uuid,
  movement_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inventory_id uuid;
  v_allocation_id uuid;
  v_movement_id uuid;
  v_movement_number text;
  v_warehouse_id uuid;
  v_contract record;
  v_rate record;
  v_existing_inventory_id uuid;
  v_quantity_kg numeric;
BEGIN
  -- Get warehouse from cold storage
  SELECT warehouse_id INTO v_warehouse_id
  FROM "public"."cold_storages" WHERE id = p_cold_storage_id;
  
  -- Validate contract
  SELECT * INTO v_contract FROM "public"."rental_contracts" WHERE id = p_contract_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;
  
  IF v_contract.status != 'ACTIVE' THEN
    RAISE EXCEPTION 'Contract must be ACTIVE to receive stock, current status: %', v_contract.status;
  END IF;
  
  -- Calculate quantity in KG
  v_quantity_kg := COALESCE(p_quantity_kg, p_quantity);
  
  -- Check cold storage capacity (company + customer combined)
  -- Reuse inventory capacity check
  PERFORM "public"."get_cold_storage_capacity"(p_cold_storage_id, NULL, NULL);
  
  -- Check storage location capacity
  -- Reuse location capacity check
  PERFORM "public"."get_storage_location_capacity"(p_storage_location_id);
  
  -- Get applicable rental rate
  SELECT * INTO v_rate FROM "public"."get_applicable_rental_rate"(
    p_organization_id, p_customer_id, p_product_id, p_cold_storage_id, p_storage_location_id
  ) LIMIT 1;
  
  IF NOT FOUND OR v_rate.rate_id IS NULL THEN
    RAISE EXCEPTION 'No applicable rental rate found for this customer/product/storage';
  END IF;
  
  -- Check if customer-owned inventory exists at this location
  SELECT id INTO v_existing_inventory_id
  FROM "public"."inventory"
  WHERE cold_storage_id = p_cold_storage_id
    AND storage_location_id = p_storage_location_id
    AND batch_id = p_batch_id
    AND owner_type = 'CUSTOMER'
    AND owner_id = p_customer_id
    AND status = 'AVAILABLE'
  LIMIT 1;
  
  IF v_existing_inventory_id IS NOT NULL THEN
    -- Update existing inventory
    UPDATE "public"."inventory"
    SET quantity = quantity + p_quantity,
        quantity_kg = COALESCE(quantity_kg, 0) + v_quantity_kg,
        received_at = COALESCE(received_at, now()),
        updated_at = now()
    WHERE id = v_existing_inventory_id
    RETURNING id INTO v_inventory_id;
  ELSE
    -- Create new customer-owned inventory
    INSERT INTO "public"."inventory" (
      organization_id, warehouse_id, cold_storage_id, storage_location_id,
      product_id, batch_id, owner_type, owner_id, quantity, unit_id,
      quantity_kg, status, received_at
    ) VALUES (
      p_organization_id, v_warehouse_id, p_cold_storage_id, p_storage_location_id,
      p_product_id, p_batch_id, 'CUSTOMER', p_customer_id, p_quantity, p_unit_id,
      v_quantity_kg, 'AVAILABLE', now()
    )
    RETURNING id INTO v_inventory_id;
  END IF;
  
  -- Create rental allocation
  INSERT INTO "public"."rental_allocations" (
    organization_id, allocation_number, contract_id, customer_id,
    inventory_id, batch_id, product_id, warehouse_id, cold_storage_id, storage_location_id,
    allocated_quantity, allocated_quantity_kg, active_quantity_kg, status
  ) VALUES (
    p_organization_id, "public"."generate_allocation_number"(p_organization_id),
    p_contract_id, p_customer_id, v_inventory_id, p_batch_id, p_product_id,
    v_warehouse_id, p_cold_storage_id, p_storage_location_id,
    p_quantity, v_quantity_kg, v_quantity_kg, 'ACTIVE'
  )
  RETURNING id INTO v_allocation_id;
  
  -- Create quantity snapshot for billing
  INSERT INTO "public"."rental_quantity_snapshots" (
    allocation_id, snapshot_date, quantity_kg, reason, reference_id, reference_type
  ) VALUES (
    v_allocation_id, CURRENT_DATE, v_quantity_kg, 'RECEIVE', v_inventory_id, 'INVENTORY'
  );
  
  -- Generate movement number
  v_movement_number := "public"."generate_rental_movement_number"(p_organization_id, 'RECEIVE');
  
  -- Create rental movement
  INSERT INTO "public"."rental_stock_movements" (
    organization_id, movement_number, movement_type, allocation_id,
    contract_id, customer_id, inventory_id, batch_id, product_id,
    destination_warehouse_id, destination_cold_storage_id, destination_location_id,
    quantity, quantity_kg, rate_id, rate_per_kg_day,
    reference_number, notes, performed_by
  ) VALUES (
    p_organization_id, v_movement_number, 'RECEIVE', v_allocation_id,
    p_contract_id, p_customer_id, v_inventory_id, p_batch_id, p_product_id,
    v_warehouse_id, p_cold_storage_id, p_storage_location_id,
    p_quantity, v_quantity_kg, v_rate.rate_id, v_rate.rate_per_kg_day,
    p_reference_number, p_notes, p_performed_by
  )
  RETURNING id INTO v_movement_id;
  
  -- Audit log
  INSERT INTO "public"."audit_logs" (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'RENTAL_RECEIVE', 'rental_allocation', v_allocation_id,
    jsonb_build_object(
      'contract_id', p_contract_id,
      'customer_id', p_customer_id,
      'inventory_id', v_inventory_id,
      'quantity_kg', v_quantity_kg,
      'rate_per_kg_day', v_rate.rate_per_kg_day
    )
  );
  
  RETURN QUERY SELECT v_inventory_id, v_allocation_id, v_movement_id, 'Rental stock received successfully'::text;
END;
$$;

-- ============================================
-- RENTAL RELEASE (Partial)
-- Creates release movement and updates allocation
-- ============================================
CREATE OR REPLACE FUNCTION "public"."release_rental_stock"(
  p_allocation_id uuid,
  p_quantity_kg numeric,
  p_performed_by uuid,
  p_reason text DEFAULT NULL,
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
  v_allocation record;
  v_movement_id uuid;
  v_movement_number text;
  v_new_active_kg numeric;
  v_new_released_kg numeric;
BEGIN
  -- Get allocation with lock
  SELECT * INTO v_allocation
  FROM "public"."rental_allocations"
  WHERE id = p_allocation_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation not found';
  END IF;
  
  IF v_allocation.active_quantity_kg < p_quantity_kg THEN
    RAISE EXCEPTION 'Insufficient active quantity: available=%, requested=%', 
      v_allocation.active_quantity_kg, p_quantity_kg;
  END IF;
  
  -- Calculate new quantities
  v_new_active_kg := v_allocation.active_quantity_kg - p_quantity_kg;
  v_new_released_kg := v_allocation.released_quantity_kg + p_quantity_kg;
  
  -- Update allocation
  UPDATE "public"."rental_allocations"
  SET active_quantity_kg = v_new_active_kg,
      released_quantity_kg = v_new_released_kg,
      status = CASE WHEN v_new_active_kg = 0 THEN 'RELEASED' ELSE 'PARTIALLY_RELEASED' END,
      released_at = CASE WHEN v_new_active_kg = 0 THEN now() ELSE released_at END,
      updated_at = now()
  WHERE id = p_allocation_id;
  
  -- Update inventory (reduce quantity)
  UPDATE "public"."inventory"
  SET quantity = quantity - (p_quantity_kg / COALESCE(NULLIF(quantity_kg, 0), 1) * quantity),
      quantity_kg = quantity_kg - p_quantity_kg,
      updated_at = now()
  WHERE id = v_allocation.inventory_id
    AND quantity_kg >= p_quantity_kg;
  
  -- Generate movement number
  v_movement_number := "public"."generate_rental_movement_number"(v_allocation.organization_id, 'RELEASE');
  
  -- Create release movement (immutable)
  INSERT INTO "public"."rental_stock_movements" (
    organization_id, movement_number, movement_type, allocation_id,
    contract_id, customer_id, inventory_id, batch_id, product_id,
    source_warehouse_id, source_cold_storage_id, source_location_id,
    quantity, quantity_kg, reason, notes, performed_by
  ) VALUES (
    v_allocation.organization_id, v_movement_number, 'RELEASE', p_allocation_id,
    v_allocation.contract_id, v_allocation.customer_id, v_allocation.inventory_id,
    v_allocation.batch_id, v_allocation.product_id,
    v_allocation.warehouse_id, v_allocation.cold_storage_id, v_allocation.storage_location_id,
    p_quantity_kg, p_quantity_kg, p_reason, p_notes, p_performed_by
  )
  RETURNING id INTO v_movement_id;
  
  -- Create quantity snapshot for billing
  INSERT INTO "public"."rental_quantity_snapshots" (
    allocation_id, snapshot_date, quantity_kg, reason, reference_id, reference_type
  ) VALUES (
    p_allocation_id, CURRENT_DATE, v_new_active_kg, 'RELEASE', v_movement_id, 'MOVEMENT'
  );
  
  -- Audit log
  INSERT INTO "public"."audit_logs" (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_allocation.organization_id, p_performed_by, 'RENTAL_RELEASE', 'rental_allocation', p_allocation_id,
    jsonb_build_object(
      'quantity_kg', p_quantity_kg,
      'remaining_active_kg', v_new_active_kg,
      'movement_id', v_movement_id
    )
  );
  
  RETURN QUERY SELECT true, 'Release successful. New active quantity: ' || v_new_active_kg, v_movement_id;
END;
$$;



-- ============================================
-- RENTAL TRANSFER
-- Transfer between cold storage/locations within same customer/contract
-- ============================================
CREATE OR REPLACE FUNCTION "public"."transfer_rental_stock"(
  p_allocation_id uuid,
  p_destination_cold_storage_id uuid,
  p_destination_location_id uuid,
  p_quantity_kg numeric,
  p_performed_by uuid,
  p_notes text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  message text,
  new_allocation_id uuid,
  transfer_reference_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_source record;
  v_dest_warehouse_id uuid;
  v_transfer_ref uuid;
  v_movement_id_out uuid;
  v_movement_id_in uuid;
  v_movement_num_out text;
  v_movement_num_in text;
  v_rate record;
  v_new_allocation_id uuid;
BEGIN
  -- Get source allocation
  SELECT * INTO v_source
  FROM "public"."rental_allocations"
  WHERE id = p_allocation_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation not found';
  END IF;
  
  IF v_source.active_quantity_kg < p_quantity_kg THEN
    RAISE EXCEPTION 'Insufficient active quantity: available=%, requested=%', 
      v_source.active_quantity_kg, p_quantity_kg;
  END IF;
  
  -- Get destination warehouse
  SELECT warehouse_id INTO v_dest_warehouse_id
  FROM "public"."cold_storages" WHERE id = p_destination_cold_storage_id;
  
  -- Get applicable rate for destination
  SELECT * INTO v_rate FROM "public"."get_applicable_rental_rate"(
    v_source.organization_id, v_source.customer_id, v_source.product_id,
    p_destination_cold_storage_id, p_destination_location_id
  ) LIMIT 1;
  
  -- Generate transfer reference
  v_transfer_ref := gen_random_uuid();
  
  -- Generate movement numbers
  v_movement_num_out := "public"."generate_rental_movement_number"(v_source.organization_id, 'TRANSFER_OUT');
  v_movement_num_in := "public"."generate_rental_movement_number"(v_source.organization_id, 'TRANSFER_IN');
  
  -- Create TRANSFER_OUT movement
  INSERT INTO "public"."rental_stock_movements" (
    organization_id, movement_number, movement_type, transfer_reference_id,
    allocation_id, contract_id, customer_id, inventory_id, batch_id, product_id,
    source_warehouse_id, source_cold_storage_id, source_location_id,
    quantity, quantity_kg, rate_id, rate_per_kg_day,
    notes, performed_by
  ) VALUES (
    v_source.organization_id, v_movement_num_out, 'TRANSFER_OUT', v_transfer_ref,
    p_allocation_id, v_source.contract_id, v_source.customer_id, v_source.inventory_id,
    v_source.batch_id, v_source.product_id,
    v_source.warehouse_id, v_source.cold_storage_id, v_source.storage_location_id,
    p_quantity_kg, p_quantity_kg, v_rate.rate_id, v_rate.rate_per_kg_day,
    p_notes, p_performed_by
  )
  RETURNING id INTO v_movement_id_out;
  
  -- Reduce source allocation
  UPDATE "public"."rental_allocations"
  SET active_quantity_kg = active_quantity_kg - p_quantity_kg,
      status = CASE WHEN active_quantity_kg - p_quantity_kg = 0 THEN 'TRANSFERRED' ELSE status END,
      updated_at = now()
  WHERE id = p_allocation_id;
  
  -- Create new allocation at destination
  INSERT INTO "public"."rental_allocations" (
    organization_id, allocation_number, contract_id, customer_id,
    inventory_id, batch_id, product_id, warehouse_id, cold_storage_id, storage_location_id,
    allocated_quantity, allocated_quantity_kg, active_quantity_kg, status
  ) VALUES (
    v_source.organization_id, "public"."generate_allocation_number"(v_source.organization_id),
    v_source.contract_id, v_source.customer_id, v_source.inventory_id, v_source.batch_id,
    v_source.product_id, v_dest_warehouse_id, p_destination_cold_storage_id, p_destination_location_id,
    p_quantity_kg, p_quantity_kg, p_quantity_kg, 'ACTIVE'
  )
  RETURNING id INTO v_new_allocation_id;
  
  -- Create quantity snapshot
  INSERT INTO "public"."rental_quantity_snapshots" (
    allocation_id, snapshot_date, quantity_kg, reason, reference_id, reference_type
  ) VALUES (
    v_new_allocation_id, CURRENT_DATE, p_quantity_kg, 'TRANSFER_IN', v_transfer_ref, 'TRANSFER'
  );
  
  -- Create TRANSFER_IN movement
  INSERT INTO "public"."rental_stock_movements" (
    organization_id, movement_number, movement_type, transfer_reference_id,
    allocation_id, contract_id, customer_id, inventory_id, batch_id, product_id,
    destination_warehouse_id, destination_cold_storage_id, destination_location_id,
    quantity, quantity_kg, rate_id, rate_per_kg_day,
    notes, performed_by
  ) VALUES (
    v_source.organization_id, v_movement_num_in, 'TRANSFER_IN', v_transfer_ref,
    v_new_allocation_id, v_source.contract_id, v_source.customer_id, v_source.inventory_id,
    v_source.batch_id, v_source.product_id,
    v_dest_warehouse_id, p_destination_cold_storage_id, p_destination_location_id,
    p_quantity_kg, p_quantity_kg, v_rate.rate_id, v_rate.rate_per_kg_day,
    p_notes, p_performed_by
  )
  RETURNING id INTO v_movement_id_in;
  
  -- Audit log
  INSERT INTO "public"."audit_logs" (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    v_source.organization_id, p_performed_by, 'RENTAL_TRANSFER', 'rental_allocation', p_allocation_id,
    jsonb_build_object(
      'source_allocation_id', p_allocation_id,
      'destination_allocation_id', v_new_allocation_id,
      'quantity_kg', p_quantity_kg,
      'destination_storage_id', p_destination_cold_storage_id,
      'new_rate_per_kg_day', v_rate.rate_per_kg_day
    )
  );
  
  RETURN QUERY SELECT true, 'Transfer successful', v_new_allocation_id, v_transfer_ref;
END;
$$;

-- ============================================
-- BILLING ENGINE
-- Calculate and create rental charges based on quantity timeline
-- ============================================
CREATE OR REPLACE FUNCTION "public"."calculate_rental_charges"(
  p_organization_id uuid,
  p_billing_start date,
  p_billing_end date,
  p_performed_by uuid,
  p_contract_id uuid DEFAULT NULL
)
RETURNS TABLE (
  charge_id uuid,
  allocation_id uuid,
  total_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_allocation record;
  v_snapshot record;
  v_prev_snapshot record;
  v_days numeric;
  v_quantity_kg numeric;
  v_rate record;
  v_charge_id uuid;
  v_charge_number text;
  v_total decimal := 0;
BEGIN
  -- Process each active allocation
  FOR v_allocation IN
    SELECT * FROM "public"."rental_allocations"
    WHERE organization_id = p_organization_id
      AND status IN ('ACTIVE', 'PARTIALLY_RELEASED')
      AND (p_contract_id IS NULL OR contract_id = p_contract_id)
  LOOP
    -- Get quantity snapshots within billing period
    FOR v_snapshot IN
      SELECT * FROM "public"."rental_quantity_snapshots"
      WHERE allocation_id = v_allocation.id
        AND snapshot_date >= p_billing_start
        AND snapshot_date <= p_billing_end
      ORDER BY snapshot_date
    LOOP
      -- Get applicable rate at snapshot date
      SELECT * INTO v_rate FROM "public"."get_applicable_rental_rate"(
        v_allocation.organization_id, v_allocation.customer_id, v_allocation.product_id,
        v_allocation.cold_storage_id, v_allocation.storage_location_id,
        v_snapshot.snapshot_date
      ) LIMIT 1;
      
      IF NOT FOUND OR v_rate.rate_id IS NULL THEN
        CONTINUE; -- Skip if no rate
      END IF;
      
      -- Calculate days and quantity
      IF v_prev_snapshot.snapshot_date IS NULL THEN
        -- First snapshot in period
        v_days := p_billing_end - v_snapshot.snapshot_date + 1;
      ELSE
        v_days := v_snapshot.snapshot_date - v_prev_snapshot.snapshot_date;
      END IF;
      
      v_quantity_kg := v_snapshot.quantity_kg;
      
      -- Calculate charge
      DECLARE
        v_subtotal numeric(14,2);
        v_discount numeric(14,2);
        v_effective_rate numeric(12,2);
      BEGIN
        v_effective_rate := v_rate.rate_per_kg_day * (1 - v_rate.discount_percentage / 100);
        v_subtotal := ROUND(v_quantity_kg * v_effective_rate * v_days, 2);
        v_discount := ROUND(v_subtotal * v_rate.discount_percentage / 100, 2);
        
        -- Generate charge number
        v_charge_number := "public"."generate_charge_number"(p_organization_id);
        
        -- Create immutable charge record
        INSERT INTO "public"."rental_charges" (
          organization_id, charge_number, contract_id, allocation_id,
          customer_id, product_id, cold_storage_id, storage_location_id,
          billing_start, billing_end,
          quantity_kg_start, quantity_kg_end, quantity_kg_average,
          days_billed, rate_id, rate_per_kg_day, discount_percentage,
          effective_rate_per_kg_day, subtotal, discount_amount, total_amount,
          calculation_notes, status
        ) VALUES (
          p_organization_id, v_charge_number, v_allocation.contract_id, v_allocation.id,
          v_allocation.customer_id, v_allocation.product_id, v_allocation.cold_storage_id, v_allocation.storage_location_id,
          COALESCE(v_prev_snapshot.snapshot_date + 1, p_billing_start), v_snapshot.snapshot_date - 1,
          COALESCE(v_prev_snapshot.quantity_kg, v_quantity_kg), v_quantity_kg, v_quantity_kg,
          v_days, v_rate.rate_id, v_rate.rate_per_kg_day, v_rate.discount_percentage,
          v_effective_rate, v_subtotal, v_discount, v_subtotal - v_discount,
          jsonb_build_object('snapshot_id', v_snapshot.id, 'rate_type', v_rate.rate_type),
          'PENDING'
        )
        RETURNING id INTO v_charge_id;
        
        v_total := v_total + (v_subtotal - v_discount);
        
        RETURN QUERY SELECT v_charge_id, v_allocation.id, v_subtotal - v_discount;
      END;
      
      v_prev_snapshot := v_snapshot;
    END LOOP;
    
    v_prev_snapshot := NULL;
  END LOOP;
  
  -- Audit log
  INSERT INTO "public"."audit_logs" (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'RENTAL_CHARGE_CALCULATION', 'rental_charges', NULL,
    jsonb_build_object(
      'billing_start', p_billing_start,
      'billing_end', p_billing_end,
      'contract_id', p_contract_id,
      'total_charges', v_total
    )
  );
END;
$$;



-- ============================================
-- INVOICE GENERATION
-- Create invoice from pending charges
-- ============================================
CREATE OR REPLACE FUNCTION "public"."generate_rental_invoice"(
  p_organization_id uuid,
  p_contract_id uuid,
  p_billing_period_start date,
  p_billing_period_end date,
  p_performed_by uuid,
  p_due_days integer DEFAULT 30,
  p_tax_percentage numeric DEFAULT 0
)
RETURNS TABLE (
  invoice_id uuid,
  invoice_number text,
  total_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_line_number int := 1;
  v_charge record;
  v_subtotal numeric(14,2) := 0;
  v_tax_amount numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_contract record;
BEGIN
  -- Validate contract
  SELECT * INTO v_contract FROM "public"."rental_contracts" WHERE id = p_contract_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;
  
  -- Check for existing invoice for this period
  IF EXISTS (
    SELECT 1 FROM "public"."rental_invoices"
    WHERE contract_id = p_contract_id
      AND billing_period_start = p_billing_period_start
      AND billing_period_end = p_billing_period_end
  ) THEN
    RAISE EXCEPTION 'Invoice already exists for this billing period';
  END IF;
  
  -- Generate invoice number
  v_invoice_number := "public"."generate_invoice_number"(p_organization_id);
  
  -- Calculate totals from pending charges
  SELECT 
    COALESCE(SUM(rc.total_amount), 0),
    COALESCE(SUM(rc.total_amount * p_tax_percentage / 100), 0)
  INTO v_subtotal, v_tax_amount
  FROM "public"."rental_charges" rc
  WHERE rc.contract_id = p_contract_id
    AND rc.billing_start >= p_billing_period_start
    AND rc.billing_end <= p_billing_period_end
    AND rc.status = 'PENDING';
  
  v_total := v_subtotal + v_tax_amount;
  
  -- Create invoice
  INSERT INTO "public"."rental_invoices" (
    organization_id, invoice_number, contract_id, customer_id,
    billing_period_start, billing_period_end,
    issue_date, due_date,
    subtotal, tax_percentage, tax_amount, total_amount,
    status, created_by
  ) VALUES (
    p_organization_id, v_invoice_number, p_contract_id, v_contract.customer_id,
    p_billing_period_start, p_billing_period_end,
    CURRENT_DATE, CURRENT_DATE + p_due_days,
    v_subtotal, p_tax_percentage, v_tax_amount, v_total,
    'ISSUED', p_performed_by
  )
  RETURNING id INTO v_invoice_id;
  
  -- Create invoice lines from charges
  FOR v_charge IN
    SELECT * FROM "public"."rental_charges"
    WHERE contract_id = p_contract_id
      AND billing_start >= p_billing_period_start
      AND billing_end <= p_billing_period_end
      AND status = 'PENDING'
    ORDER BY billing_start
  LOOP
    INSERT INTO "public"."rental_invoice_lines" (
      invoice_id, charge_id, line_number,
      product_id, product_name, product_sku,
      cold_storage_name, storage_location_name,
      quantity_kg_average, days_billed,
      rate_per_kg_day, discount_percentage,
      subtotal, discount_amount, tax_percentage, tax_amount, line_total,
      billing_start, billing_end
    ) VALUES (
      v_invoice_id, v_charge.id, v_line_number,
      v_charge.product_id, (SELECT name FROM "public"."products" WHERE id = v_charge.product_id),
      (SELECT sku FROM "public"."products" WHERE id = v_charge.product_id),
      (SELECT name FROM "public"."cold_storages" WHERE id = v_charge.cold_storage_id),
      (SELECT name FROM "public"."storage_locations" WHERE id = v_charge.storage_location_id),
      v_charge.quantity_kg_average, v_charge.days_billed,
      v_charge.rate_per_kg_day, v_charge.discount_percentage,
      v_charge.subtotal, v_charge.discount_amount, p_tax_percentage,
      ROUND(v_charge.total_amount * p_tax_percentage / 100, 2),
      v_charge.total_amount + ROUND(v_charge.total_amount * p_tax_percentage / 100, 2),
      v_charge.billing_start, v_charge.billing_end
    );
    
    -- Update charge status to INVOICED
    UPDATE "public"."rental_charges"
    SET status = 'INVOICED',
        invoice_line_id = v_charge.id
    WHERE id = v_charge.id;
    
    v_line_number := v_line_number + 1;
  END LOOP;
  
  -- Audit log
  INSERT INTO "public"."audit_logs" (
    organization_id, actor_user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_organization_id, p_performed_by, 'RENTAL_INVOICE_GENERATED', 'rental_invoice', v_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'contract_id', p_contract_id,
      'billing_period', p_billing_period_start || ' to ' || p_billing_period_end,
      'total_amount', v_total
    )
  );
  
  RETURN QUERY SELECT v_invoice_id, v_invoice_number, v_total;
END;
$$;

-- ============================================
-- COMBINED COLD STORAGE CAPACITY
-- Company + customer inventory combined
-- ============================================
CREATE OR REPLACE FUNCTION "public"."get_combined_storage_capacity"(
  p_cold_storage_id uuid
)
RETURNS TABLE (
  total_capacity_kg numeric,
  company_occupied_kg numeric,
  customer_occupied_kg numeric,
  total_occupied_kg numeric,
  available_kg numeric,
  utilization_percentage numeric
)
LANGUAGE sql
STABLE
AS $$
WITH cs AS (
  SELECT capacity_kg FROM "public"."cold_storages" WHERE id = p_cold_storage_id
),
company AS (
  SELECT COALESCE(SUM(quantity_kg), 0)::numeric as kg
  FROM "public"."inventory"
  WHERE cold_storage_id = p_cold_storage_id
    AND owner_type = 'COMPANY'
    AND status IN ('AVAILABLE', 'QUARANTINE')
),
customer AS (
  SELECT COALESCE(SUM(active_quantity_kg), 0)::numeric as kg
  FROM "public"."rental_allocations"
  WHERE cold_storage_id = p_cold_storage_id
    AND status IN ('ACTIVE', 'PARTIALLY_RELEASED')
)
SELECT 
  cs.capacity_kg as total_capacity_kg,
  COALESCE(c.kg, 0) as company_occupied_kg,
  COALESCE(cu.kg, 0) as customer_occupied_kg,
  COALESCE(c.kg, 0) + COALESCE(cu.kg, 0) as total_occupied_kg,
  cs.capacity_kg - (COALESCE(c.kg, 0) + COALESCE(cu.kg, 0)) as available_kg,
  CASE WHEN cs.capacity_kg > 0 
    THEN ((COALESCE(c.kg, 0) + COALESCE(cu.kg, 0)) / cs.capacity_kg * 100)::numeric(5,2)
    ELSE 0 
  END as utilization_percentage
FROM cs
CROSS JOIN company c
CROSS JOIN customer cu;
$$;

