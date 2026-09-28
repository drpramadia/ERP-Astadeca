-- Migration: 009_supply_chain_tables.sql
-- Description: Supply chain tables (purchases, receiving, QC, sales, delivery, returns)
-- Date: 2026-09-26
-- Safe: IDEMPOTENT with ON CONFLICT / IF NOT EXISTS

-- ============================================
-- PURCHASE REQUESTS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."purchase_requests" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "pr_number" text NOT NULL,
    "supplier_id" uuid NOT NULL,
    "requester_id" uuid NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "request_date" date NOT NULL,
    "needed_date" date,
    "notes" text,
    "approval_request_id" uuid,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "purchase_requests_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."purchase_requests" OWNER TO "postgres";

-- PR items
CREATE TABLE IF NOT EXISTS "public"."purchase_request_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "pr_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "quantity_kg" numeric(14,3),
    "unit_id" uuid NOT NULL,
    "requested_price" numeric(16,2),
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."purchase_request_items" OWNER TO "postgres";

-- ============================================
-- PURCHASE ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."purchase_orders" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "po_number" text NOT NULL,
    "supplier_id" uuid NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "order_date" date NOT NULL,
    "expected_date" date,
    "subtotal" numeric(16,2) DEFAULT 0 NOT NULL,
    "tax_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "discount_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "payment_terms_days" integer DEFAULT 0 NOT NULL,
    "notes" text,
    "approval_request_id" uuid,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "purchase_orders_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'ORDERED'::text, 'PARTIALLY_RECEIVED'::text, 'RECEIVED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."purchase_orders" OWNER TO "postgres";

-- PO items
CREATE TABLE IF NOT EXISTS "public"."purchase_order_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "po_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "quantity_kg" numeric(14,3),
    "unit_id" uuid NOT NULL,
    "unit_price" numeric(16,2),
    "received_quantity" numeric(14,3) DEFAULT 0 NOT NULL,
    "received_quantity_kg" numeric(14,3),
    "received_date" date,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."purchase_order_items" OWNER TO "postgres";

-- ============================================
-- RECEIVING RECORDS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."receiving_records" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "receiving_number" text NOT NULL,
    "po_id" uuid,
    "supplier_id" uuid NOT NULL,
    "batch_id" uuid,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "received_date" date NOT NULL,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "notes" text,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "receiving_records_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'PARTIAL'::text, 'COMPLETED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."receiving_records" OWNER TO "postgres";

-- Receiving items
CREATE TABLE IF NOT EXISTS "public"."receiving_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "receiving_id" uuid NOT NULL,
    "po_item_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "batch_id" uuid NOT NULL,
    "ordered_quantity" numeric(14,3) NOT NULL,
    "ordered_quantity_kg" numeric(14,3),
    "actual_quantity" numeric(14,3) NOT NULL,
    "actual_quantity_kg" numeric(14,3),
    "operation_type" text NOT NULL,
    "cold_storage_id" uuid,
    "storage_location_id" uuid,
    "qc_status" text DEFAULT 'PENDING'::text NOT NULL,
    "qc_inspector_id" uuid,
    "qc_reference" text,
    "qc_notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."receiving_items" OWNER TO "postgres";

-- ============================================
-- QC INSPECTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."qc_inspections" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "qc_number" text NOT NULL,
    "receiving_id" uuid,
    "batch_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "inspection_date" date NOT NULL,
    "inspector_id" uuid NOT NULL,
    "inspection_result" text,
    "defects_found" text,
    "sample_size" text,
    "notes" text,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "qc_inspections_status_check" CHECK (status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'ACCEPTED'::text, 'PARTIAL_ACCEPT'::text, 'QUARANTINE'::text, 'REJECTED'::text]))
);

ALTER TABLE "public"."qc_inspections" OWNER TO "postgres";

-- ============================================
-- SALES ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."sales_orders" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "order_number" text NOT NULL,
    "customer_id" uuid NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "order_date" date NOT NULL,
    "due_date" date,
    "subtotal" numeric(16,2) DEFAULT 0 NOT NULL,
    "tax_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "discount_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "payment_terms_days" integer DEFAULT 0 NOT NULL,
    "notes" text,
    "approval_request_id" uuid,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "sales_orders_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'CONFIRMED'::text, 'PROCESSING'::text, 'PICKING'::text, 'SHIPPED'::text, 'DELIVERED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."sales_orders" OWNER TO "postgres";

-- SO items
CREATE TABLE IF NOT EXISTS "public"."sales_order_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "so_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "quantity_kg" numeric(14,3),
    "unit_id" uuid NOT NULL,
    "unit_price" numeric(16,2),
    "picked_quantity" numeric(14,3) DEFAULT 0 NOT NULL,
    "delivered_quantity" numeric(14,3) DEFAULT 0 NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."sales_order_items" OWNER TO "postgres";

-- ============================================
-- QUOTATIONS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."quotations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "quotation_number" text NOT NULL,
    "customer_id" uuid NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "quotation_date" date NOT NULL,
    "valid_until" date,
    "subtotal" numeric(16,2) DEFAULT 0 NOT NULL,
    "tax_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "discount_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "notes" text,
    "validity_days" integer DEFAULT 14 NOT NULL,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "quotations_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'APPROVED'::text, 'REJECTED'::text, 'EXPIRED'::text, 'CONVERTED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."quotations" OWNER TO "postgres";

-- Quotation items
CREATE TABLE IF NOT EXISTS "public"."quotation_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "quotation_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "quantity_kg" numeric(14,3),
    "unit_id" uuid NOT NULL,
    "unit_price" numeric(16,2),
    "discount_percentage" numeric(5,2) DEFAULT 0 NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."quotation_items" OWNER TO "postgres";

-- ============================================
-- DELIVERY ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."delivery_orders" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "do_number" text NOT NULL,
    "sales_order_id" uuid,
    "customer_id" uuid NOT NULL,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "scheduled_date" date,
    "shipped_date" date,
    "delivered_date" date,
    "vehicle_id" uuid,
    "driver_id" uuid,
    "recipient_name" text,
    "recipient_phone" text,
    "recipient_address" text,
    "recipient_signature_url" text,
    "pod_photo_url" text,
    "notes" text,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "delivery_orders_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'READY'::text, 'IN_TRANSIT'::text, 'DELIVERED'::text, 'FAILED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."delivery_orders" OWNER TO "postgres";

-- DO items
CREATE TABLE IF NOT EXISTS "public"."delivery_order_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "do_id" uuid NOT NULL,
    "so_item_id" uuid,
    "product_id" uuid NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "quantity_kg" numeric(14,3),
    "unit_id" uuid NOT NULL,
    "batch_id" uuid,
    "status" text DEFAULT 'PENDING'::text NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."delivery_order_items" OWNER TO "postgres";

-- ============================================
-- RETURNS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."returns" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid NOT NULL,
    "return_number" text NOT NULL,
    "type" text NOT NULL,
    "customer_id" uuid,
    "supplier_id" uuid,
    "status" text DEFAULT 'DRAFT'::text NOT NULL,
    "return_date" date NOT NULL,
    "due_date" date,
    "subtotal" numeric(16,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(16,2) DEFAULT 0 NOT NULL,
    "notes" text,
    "approval_request_id" uuid,
    "created_by" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "returns_type_check" CHECK (type = ANY (ARRAY['CUSTOMER_RETURN'::text, 'SUPPLIER_RETURN'::text])),
    CONSTRAINT "returns_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'PENDING_APPROVAL'::text, 'APPROVED'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'CANCELLED'::text]))
);

ALTER TABLE "public"."returns" OWNER TO "postgres";

-- Return items
CREATE TABLE IF NOT EXISTS "public"."return_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "return_id" uuid NOT NULL,
    "product_id" uuid NOT NULL,
    "batch_id" uuid,
    "quantity" numeric(14,3) NOT NULL,
    "quantity_kg" numeric(14,3),
    "unit_id" uuid NOT NULL,
    "reason" text NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "public"."return_items" OWNER TO "postgres";

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_org" ON "public"."purchase_requests" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_number" ON "public"."purchase_requests" USING btree ("pr_number");
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_status" ON "public"."purchase_requests" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_purchase_requests_supplier" ON "public"."purchase_requests" USING btree ("supplier_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_request_items_pr" ON "public"."purchase_request_items" USING btree ("pr_id");

CREATE INDEX IF NOT EXISTS "idx_purchase_orders_org" ON "public"."purchase_orders" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_number" ON "public"."purchase_orders" USING btree ("po_number");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_status" ON "public"."purchase_orders" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_supplier" ON "public"."purchase_orders" USING btree ("supplier_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_order_items_po" ON "public"."purchase_order_items" USING btree ("po_id");

CREATE INDEX IF NOT EXISTS "idx_receiving_records_org" ON "public"."receiving_records" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_receiving_records_number" ON "public"."receiving_records" USING btree ("receiving_number");
CREATE INDEX IF NOT EXISTS "idx_receiving_records_status" ON "public"."receiving_records" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_receiving_items_receiving" ON "public"."receiving_items" USING btree ("receiving_id");

CREATE INDEX IF NOT EXISTS "idx_qc_inspections_org" ON "public"."qc_inspections" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_qc_inspections_number" ON "public"."qc_inspections" USING btree ("qc_number");
CREATE INDEX IF NOT EXISTS "idx_qc_inspections_status" ON "public"."qc_inspections" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_qc_inspections_batch" ON "public"."qc_inspections" USING btree ("batch_id");

CREATE INDEX IF NOT EXISTS "idx_sales_orders_org" ON "public"."sales_orders" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_sales_orders_number" ON "public"."sales_orders" USING btree ("order_number");
CREATE INDEX IF NOT EXISTS "idx_sales_orders_status" ON "public"."sales_orders" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_sales_orders_customer" ON "public"."sales_orders" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_sales_order_items_so" ON "public"."sales_order_items" USING btree ("so_id");

CREATE INDEX IF NOT EXISTS "idx_quotations_org" ON "public"."quotations" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_quotations_number" ON "public"."quotations" USING btree ("quotation_number");
CREATE INDEX IF NOT EXISTS "idx_quotations_status" ON "public"."quotations" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_quotation_items_quotation" ON "public"."quotation_items" USING btree ("quotation_id");

CREATE INDEX IF NOT EXISTS "idx_delivery_orders_org" ON "public"."delivery_orders" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_delivery_orders_number" ON "public"."delivery_orders" USING btree ("do_number");
CREATE INDEX IF NOT EXISTS "idx_delivery_orders_status" ON "public"."delivery_orders" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_delivery_orders_customer" ON "public"."delivery_orders" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_delivery_order_items_do" ON "public"."delivery_order_items" USING btree ("do_id");

CREATE INDEX IF NOT EXISTS "idx_returns_org" ON "public"."returns" USING btree ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_returns_number" ON "public"."returns" USING btree ("return_number");
CREATE INDEX IF NOT EXISTS "idx_returns_status" ON "public"."returns" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_return_items_return" ON "public"."return_items" USING btree ("return_id");

-- ============================================
-- FOREIGN KEYS
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_requests'::regclass AND conname = 'pr_organization_id_fkey'
  ) THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "pr_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_requests'::regclass AND conname = 'pr_supplier_id_fkey'
  ) THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "pr_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_requests'::regclass AND conname = 'pr_requester_id_fkey'
  ) THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "pr_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_requests'::regclass AND conname = 'pr_approval_request_id_fkey'
  ) THEN
    ALTER TABLE "purchase_requests" ADD CONSTRAINT "pr_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_request_items'::regclass AND conname = 'pri_pr_id_fkey'
  ) THEN
    ALTER TABLE "purchase_request_items" ADD CONSTRAINT "pri_pr_id_fkey" FOREIGN KEY ("pr_id") REFERENCES "public"."purchase_requests" ("id") ON DELETE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_request_items'::regclass AND conname = 'pri_product_id_fkey'
  ) THEN
    ALTER TABLE "purchase_request_items" ADD CONSTRAINT "pri_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_request_items'::regclass AND conname = 'pri_unit_id_fkey'
  ) THEN
    ALTER TABLE "purchase_request_items" ADD CONSTRAINT "pri_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_orders'::regclass AND conname = 'po_organization_id_fkey'
  ) THEN
    ALTER TABLE "purchase_orders" ADD CONSTRAINT "po_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_orders'::regclass AND conname = 'po_supplier_id_fkey'
  ) THEN
    ALTER TABLE "purchase_orders" ADD CONSTRAINT "po_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_orders'::regclass AND conname = 'po_created_by_fkey'
  ) THEN
    ALTER TABLE "purchase_orders" ADD CONSTRAINT "po_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_orders'::regclass AND conname = 'po_approval_request_id_fkey'
  ) THEN
    ALTER TABLE "purchase_orders" ADD CONSTRAINT "po_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_order_items'::regclass AND conname = 'poi_po_id_fkey'
  ) THEN
    ALTER TABLE "purchase_order_items" ADD CONSTRAINT "poi_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders" ("id") ON DELETE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_order_items'::regclass AND conname = 'poi_product_id_fkey'
  ) THEN
    ALTER TABLE "purchase_order_items" ADD CONSTRAINT "poi_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_order_items'::regclass AND conname = 'poi_unit_id_fkey'
  ) THEN
    ALTER TABLE "purchase_order_items" ADD CONSTRAINT "poi_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_records'::regclass AND conname = 'rr_organization_id_fkey'
  ) THEN
    ALTER TABLE "receiving_records" ADD CONSTRAINT "rr_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_records'::regclass AND conname = 'rr_po_id_fkey'
  ) THEN
    ALTER TABLE "receiving_records" ADD CONSTRAINT "rr_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_records'::regclass AND conname = 'rr_supplier_id_fkey'
  ) THEN
    ALTER TABLE "receiving_records" ADD CONSTRAINT "rr_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_records'::regclass AND conname = 'rr_batch_id_fkey'
  ) THEN
    ALTER TABLE "receiving_records" ADD CONSTRAINT "rr_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_records'::regclass AND conname = 'rr_created_by_fkey'
  ) THEN
    ALTER TABLE "receiving_records" ADD CONSTRAINT "rr_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_items'::regclass AND conname = 'ri_receiving_id_fkey'
  ) THEN
    ALTER TABLE "receiving_items" ADD CONSTRAINT "ri_receiving_id_fkey" FOREIGN KEY ("receiving_id") REFERENCES "public"."receiving_records" ("id") ON DELETE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_items'::regclass AND conname = 'ri_po_item_id_fkey'
  ) THEN
    ALTER TABLE "receiving_items" ADD CONSTRAINT "ri_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "public"."purchase_order_items" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_items'::regclass AND conname = 'ri_product_id_fkey'
  ) THEN
    ALTER TABLE "receiving_items" ADD CONSTRAINT "ri_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_items'::regclass AND conname = 'ri_batch_id_fkey'
  ) THEN
    ALTER TABLE "receiving_items" ADD CONSTRAINT "ri_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_items'::regclass AND conname = 'ri_cold_storage_id_fkey'
  ) THEN
    ALTER TABLE "receiving_items" ADD CONSTRAINT "ri_cold_storage_id_fkey" FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.receiving_items'::regclass AND conname = 'ri_storage_location_id_fkey'
  ) THEN
    ALTER TABLE "receiving_items" ADD CONSTRAINT "ri_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "public"."storage_locations" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.qc_inspections'::regclass AND conname = 'qi_organization_id_fkey'
  ) THEN
    ALTER TABLE "qc_inspections" ADD CONSTRAINT "qi_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.qc_inspections'::regclass AND conname = 'qi_receiving_id_fkey'
  ) THEN
    ALTER TABLE "qc_inspections" ADD CONSTRAINT "qi_receiving_id_fkey" FOREIGN KEY ("receiving_id") REFERENCES "public"."receiving_records" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.qc_inspections'::regclass AND conname = 'qi_batch_id_fkey'
  ) THEN
    ALTER TABLE "qc_inspections" ADD CONSTRAINT "qi_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.qc_inspections'::regclass AND conname = 'qi_product_id_fkey'
  ) THEN
    ALTER TABLE "qc_inspections" ADD CONSTRAINT "qi_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.qc_inspections'::regclass AND conname = 'qi_inspector_id_fkey'
  ) THEN
    ALTER TABLE "qc_inspections" ADD CONSTRAINT "qi_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.qc_inspections'::regclass AND conname = 'qi_approved_by_fkey'
  ) THEN
    ALTER TABLE "qc_inspections" ADD CONSTRAINT "qi_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sales_orders'::regclass AND conname = 'so_organization_id_fkey'
  ) THEN
    ALTER TABLE "sales_orders" ADD CONSTRAINT "so_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sales_orders'::regclass AND conname = 'so_customer_id_fkey'
  ) THEN
    ALTER TABLE "sales_orders" ADD CONSTRAINT "so_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sales_orders'::regclass AND conname = 'so_created_by_fkey'
  ) THEN
    ALTER TABLE "sales_orders" ADD CONSTRAINT "so_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sales_orders'::regclass AND conname = 'so_approval_request_id_fkey'
  ) THEN
    ALTER TABLE "sales_orders" ADD CONSTRAINT "so_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sales_order_items'::regclass AND conname = 'soi_so_id_fkey'
  ) THEN
    ALTER TABLE "sales_order_items" ADD CONSTRAINT "soi_so_id_fkey" FOREIGN KEY ("so_id") REFERENCES "public"."sales_orders" ("id") ON DELETE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sales_order_items'::regclass AND conname = 'soi_product_id_fkey'
  ) THEN
    ALTER TABLE "sales_order_items" ADD CONSTRAINT "soi_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.sales_order_items'::regclass AND conname = 'soi_unit_id_fkey'
  ) THEN
    ALTER TABLE "sales_order_items" ADD CONSTRAINT "soi_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quotations'::regclass AND conname = 'quotation_org_id_fkey'
  ) THEN
    ALTER TABLE "quotations" ADD CONSTRAINT "quotation_org_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quotations'::regclass AND conname = 'quotation_customer_id_fkey'
  ) THEN
    ALTER TABLE "quotations" ADD CONSTRAINT "quotation_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quotations'::regclass AND conname = 'quotation_created_by_fkey'
  ) THEN
    ALTER TABLE "quotations" ADD CONSTRAINT "quotation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quotation_items'::regclass AND conname = 'qi_quotation_id_fkey'
  ) THEN
    ALTER TABLE "quotation_items" ADD CONSTRAINT "qi_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations" ("id") ON DELETE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quotation_items'::regclass AND conname = 'qi_product_id_fkey'
  ) THEN
    ALTER TABLE "quotation_items" ADD CONSTRAINT "qi_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.quotation_items'::regclass AND conname = 'qi_unit_id_fkey'
  ) THEN
    ALTER TABLE "quotation_items" ADD CONSTRAINT "qi_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_orders'::regclass AND conname = 'do_organization_id_fkey'
  ) THEN
    ALTER TABLE "delivery_orders" ADD CONSTRAINT "do_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_orders'::regclass AND conname = 'do_sales_order_id_fkey'
  ) THEN
    ALTER TABLE "delivery_orders" ADD CONSTRAINT "do_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_orders'::regclass AND conname = 'do_customer_id_fkey'
  ) THEN
    ALTER TABLE "delivery_orders" ADD CONSTRAINT "do_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_orders'::regclass AND conname = 'do_created_by_fkey'
  ) THEN
    ALTER TABLE "delivery_orders" ADD CONSTRAINT "do_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_order_items'::regclass AND conname = 'doi_do_id_fkey'
  ) THEN
    ALTER TABLE "delivery_order_items" ADD CONSTRAINT "doi_do_id_fkey" FOREIGN KEY ("do_id") REFERENCES "public"."delivery_orders" ("id") ON DELETE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_order_items'::regclass AND conname = 'doi_so_item_id_fkey'
  ) THEN
    ALTER TABLE "delivery_order_items" ADD CONSTRAINT "doi_so_item_id_fkey" FOREIGN KEY ("so_item_id") REFERENCES "public"."sales_order_items" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_order_items'::regclass AND conname = 'doi_product_id_fkey'
  ) THEN
    ALTER TABLE "delivery_order_items" ADD CONSTRAINT "doi_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_order_items'::regclass AND conname = 'doi_batch_id_fkey'
  ) THEN
    ALTER TABLE "delivery_order_items" ADD CONSTRAINT "doi_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.delivery_order_items'::regclass AND conname = 'doi_unit_id_fkey'
  ) THEN
    ALTER TABLE "delivery_order_items" ADD CONSTRAINT "doi_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.returns'::regclass AND conname = 'returns_org_id_fkey'
  ) THEN
    ALTER TABLE "returns" ADD CONSTRAINT "returns_org_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.returns'::regclass AND conname = 'returns_customer_id_fkey'
  ) THEN
    ALTER TABLE "returns" ADD CONSTRAINT "returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.returns'::regclass AND conname = 'returns_supplier_id_fkey'
  ) THEN
    ALTER TABLE "returns" ADD CONSTRAINT "returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.returns'::regclass AND conname = 'returns_created_by_fkey'
  ) THEN
    ALTER TABLE "returns" ADD CONSTRAINT "returns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.returns'::regclass AND conname = 'returns_approval_request_id_fkey'
  ) THEN
    ALTER TABLE "returns" ADD CONSTRAINT "returns_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests" ("id");
  END IF;
END;
$$;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.return_items'::regclass AND conname = 'ri_return_id_fkey'
  ) THEN
    ALTER TABLE "return_items" ADD CONSTRAINT "ri_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "public"."returns" ("id") ON DELETE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.return_items'::regclass AND conname = 'ri_product_id_fkey'
  ) THEN
    ALTER TABLE "return_items" ADD CONSTRAINT "ri_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.return_items'::regclass AND conname = 'ri_batch_id_fkey'
  ) THEN
    ALTER TABLE "return_items" ADD CONSTRAINT "ri_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."batches" ("id");
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.return_items'::regclass AND conname = 'ri_unit_id_fkey'
  ) THEN
    ALTER TABLE "return_items" ADD CONSTRAINT "ri_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units" ("id");
  END IF;
END;
$$;

