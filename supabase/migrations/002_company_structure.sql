-- Migration: 002_company_structure.sql
-- Description: Business units, warehouses, cold storages, and storage locations
-- Generated from remote schema dump
-- Date: 2026-09-26


-- ============================================
-- TABLE DEFINITIONS
-- ============================================
CREATE TABLE IF NOT EXISTS "public"."business_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "unit_type" "text" DEFAULT 'BUSINESS_UNIT'::"text" NOT NULL,
    "description" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "logo_path" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "business_units_unit_type_check" CHECK (("unit_type" = ANY (ARRAY['OPERATING_UNIT'::"text", 'BUSINESS_UNIT'::"text", 'BRANCH'::"text", 'DIVISION'::"text"])))
);


ALTER TABLE "public"."business_units" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "business_unit_id" "uuid",
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "warehouse_type" "text" DEFAULT 'COLD_STORAGE'::"text" NOT NULL,
    "address" "text",
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "warehouses_warehouse_type_check" CHECK (("warehouse_type" = ANY (ARRAY['COLD_STORAGE'::"text", 'DRY_STORAGE'::"text", 'STAGING'::"text", 'QUARANTINE'::"text", 'OTHER'::"text"])))
);


ALTER TABLE "public"."warehouses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."cold_storages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "capacity_kg" numeric(14,2) DEFAULT 0 NOT NULL,
    "temperature_min_c" numeric(6,2),
    "temperature_max_c" numeric(6,2),
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cold_storages_capacity_kg_check" CHECK (("capacity_kg" >= (0)::numeric)),
    CONSTRAINT "cold_storages_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'MAINTENANCE'::"text", 'INACTIVE'::"text"])))
);


ALTER TABLE "public"."cold_storages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."storage_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "cold_storage_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "aisle" "text",
    "rack" "text",
    "level" "text",
    "capacity_kg" numeric(14,2) DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "storage_locations_capacity_kg_check" CHECK (("capacity_kg" >= (0)::numeric))
);


ALTER TABLE "public"."storage_locations" OWNER TO "postgres";

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS "idx_business_units_org" ON "public"."business_units" USING "btree" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_cold_storages_org" ON "public"."cold_storages" USING "btree" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_cold_storages_warehouse" ON "public"."cold_storages" USING "btree" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_storage_locations_cold_storage" ON "public"."storage_locations" USING "btree" ("cold_storage_id");
CREATE INDEX IF NOT EXISTS "idx_storage_locations_org" ON "public"."storage_locations" USING "btree" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_warehouses_business_unit" ON "public"."warehouses" USING "btree" ("business_unit_id");
CREATE INDEX IF NOT EXISTS "idx_warehouses_org" ON "public"."warehouses" USING "btree" ("organization_id");

-- ============================================
-- FOREIGN KEYS
-- ============================================
    ADD CONSTRAINT "business_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
    ADD CONSTRAINT "cold_storages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
    ADD CONSTRAINT "cold_storages_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE RESTRICT;
    ADD CONSTRAINT "storage_locations_cold_storage_id_fkey" FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages"("id") ON DELETE RESTRICT;
    ADD CONSTRAINT "storage_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
    ADD CONSTRAINT "warehouses_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE RESTRICT;
    ADD CONSTRAINT "warehouses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;

-- ============================================
-- TRIGGERS: Auto-update updated_at
-- ============================================

-- Auto-update updated_at triggers
DROP TRIGGER IF EXISTS "business_units_updated_at" ON "public"."business_units";
CREATE TRIGGER "business_units_updated_at"
    BEFORE UPDATE ON "public"."business_units"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "warehouses_updated_at" ON "public"."warehouses";
CREATE TRIGGER "warehouses_updated_at"
    BEFORE UPDATE ON "public"."warehouses"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "cold_storages_updated_at" ON "public"."cold_storages";
CREATE TRIGGER "cold_storages_updated_at"
    BEFORE UPDATE ON "public"."cold_storages"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

DROP TRIGGER IF EXISTS "storage_locations_updated_at" ON "public"."storage_locations";
CREATE TRIGGER "storage_locations_updated_at"
    BEFORE UPDATE ON "public"."storage_locations"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


-- ============================================
-- ROW LEVEL SECURITY
-- ============================================



ALTER TABLE "public"."business_units" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."cold_storages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storage_locations" ENABLE ROW LEVEL SECURITY;



ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================


CREATE POLICY "business_units_manage" ON "public"."business_units" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));




CREATE POLICY "business_units_select" ON "public"."business_units" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "cold_storages_manage" ON "public"."cold_storages" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));




CREATE POLICY "cold_storages_select" ON "public"."cold_storages" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "storage_locations_manage" ON "public"."storage_locations" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));




CREATE POLICY "storage_locations_select" ON "public"."storage_locations" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "warehouses_manage" ON "public"."warehouses" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));




CREATE POLICY "warehouses_select" ON "public"."warehouses" FOR SELECT USING ("public"."is_org_member"("organization_id"));
