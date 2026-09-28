-- Migration: 025_units_table.sql
-- Description: Create units of measure table
-- Date: 2026-09-27

CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "organization_id" uuid,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "type" text DEFAULT 'UNIT'::text NOT NULL,
    "base_unit_id" uuid,
    "conversion_factor" numeric(14,6) DEFAULT 1,
    "symbol" text,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "units_type_check" CHECK (type = ANY (ARRAY['UNIT'::text, 'WEIGHT'::text, 'VOLUME'::text, 'COUNT'::text]))
);

ALTER TABLE "public"."units" OWNER TO "postgres";

CREATE INDEX IF NOT EXISTS "idx_units_org" ON "public"."units" USING "btree" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_units_code" ON "public"."units" USING "btree" ("code");

-- Insert default KG unit
INSERT INTO "public"."units" (id, organization_id, code, name, type, conversion_factor, symbol, active)
VALUES 
    ('00000000-0000-0000-0000-000000000001', NULL, 'KG', 'Kilogram', 'WEIGHT', 1, 'kg', true),
    ('00000000-0000-0000-0000-000000000002', NULL, 'G', 'Gram', 'WEIGHT', 1000, 'g', true),
    ('00000000-0000-0000-0000-000000000003', NULL, 'TON', 'Ton', 'WEIGHT', 0.001, 'ton', true),
    ('00000000-0000-0000-0000-000000000004', NULL, 'PCS', 'Pieces', 'COUNT', 1, 'pcs', true)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "units_select" ON "public"."units";
CREATE POLICY "units_select" ON "public"."units"
  FOR SELECT USING (active = true OR organization_id IS NULL);

DROP POLICY IF EXISTS "units_all" ON "public"."units";
CREATE POLICY "units_all" ON "public"."units"
  FOR ALL USING ("public"."has_org_permission"(organization_id, 'admin.master_data'::text))
  WITH CHECK ("public"."has_org_permission"(organization_id, 'admin.master_data'::text));
