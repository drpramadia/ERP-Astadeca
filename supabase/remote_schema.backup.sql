


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin

  insert into public.profiles (
    id,
    full_name,
    phone
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;

  return new;

end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    exists (
      select 1
      from public.organization_memberships om
      join public.roles r
        on r.id = om.role_id
      join public.role_permissions rp
        on rp.role_id = r.id
      join public.permissions p
        on p.id = rp.permission_id
      where om.organization_id = p_org_id
        and om.user_id = auth.uid()
        and om.is_active = true
        and p.code = p_permission_code
    )
    or
    exists (
      select 1
      from public.organization_memberships om
      join public.roles r
        on r.id = om.role_id
      where om.organization_id = p_org_id
        and om.user_id = auth.uid()
        and om.is_active = true
        and r.code = 'DIRECTOR'
    );
$$;


ALTER FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_director"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.roles r
      on r.id = m.role_id
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and r.code = 'DIRECTOR'
  );
$$;


ALTER FUNCTION "public"."is_org_director"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_org_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;


ALTER FUNCTION "public"."is_org_member"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."approval_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "approval_request_id" "uuid" NOT NULL,
    "approval_step_id" "uuid",
    "acted_by" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approval_actions_action_check" CHECK (("action" = ANY (ARRAY['APPROVE'::"text", 'REJECT'::"text", 'REQUEST_REVISION'::"text"])))
);


ALTER TABLE "public"."approval_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approval_requests_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text", 'REVISION'::"text", 'CANCELLED'::"text"])))
);


ALTER TABLE "public"."approval_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "approval_request_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "approver_role_id" "uuid",
    "assigned_user_id" "uuid",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "acted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "approval_steps_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text", 'REVISION'::"text", 'SKIPPED'::"text"])))
);


ALTER TABLE "public"."approval_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "old_data" "jsonb",
    "new_data" "jsonb",
    "ip_address" "inet",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "customer_type" "text",
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "tax_id" "text",
    "is_supply_chain_customer" boolean DEFAULT true NOT NULL,
    "is_rental_customer" boolean DEFAULT false NOT NULL,
    "payment_terms_days" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customers_payment_terms_days_check" CHECK (("payment_terms_days" >= 0))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organization_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "legal_name" "text",
    "code" "text",
    "tax_id" "text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "module" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "unit_id" "uuid",
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "brand" "text",
    "purchase_price" numeric(16,2) DEFAULT 0 NOT NULL,
    "selling_price" numeric(16,2) DEFAULT 0 NOT NULL,
    "min_stock" numeric(14,2) DEFAULT 0 NOT NULL,
    "max_stock" numeric(14,2),
    "track_batch" boolean DEFAULT true NOT NULL,
    "track_expiry" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "products_min_stock_check" CHECK (("min_stock" >= (0)::numeric)),
    CONSTRAINT "products_purchase_price_check" CHECK (("purchase_price" >= (0)::numeric)),
    CONSTRAINT "products_selling_price_check" CHECK (("selling_price" >= (0)::numeric))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "avatar_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "supplier_type" "text",
    "contact_person" "text",
    "phone" "text",
    "email" "text",
    "address" "text",
    "tax_id" "text",
    "payment_terms_days" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "suppliers_payment_terms_days_check" CHECK (("payment_terms_days" >= 0))
);


ALTER TABLE "public"."suppliers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."units" OWNER TO "postgres";


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


ALTER TABLE ONLY "public"."approval_actions"
    ADD CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_steps"
    ADD CONSTRAINT "approval_steps_approval_request_id_step_number_key" UNIQUE ("approval_request_id", "step_number");



ALTER TABLE ONLY "public"."approval_steps"
    ADD CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_units"
    ADD CONSTRAINT "business_units_org_code_unique" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."business_units"
    ADD CONSTRAINT "business_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cold_storages"
    ADD CONSTRAINT "cold_storages_org_code_unique" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."cold_storages"
    ADD CONSTRAINT "cold_storages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_org_code_unique" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_org_code_unique" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_org_sku_unique" UNIQUE ("organization_id", "sku");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storage_locations"
    ADD CONSTRAINT "storage_locations_cs_code_unique" UNIQUE ("cold_storage_id", "code");



ALTER TABLE ONLY "public"."storage_locations"
    ADD CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_org_code_unique" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_org_code_unique" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_org_code_unique" UNIQUE ("organization_id", "code");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_approval_entity" ON "public"."approval_requests" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_approval_org_status" ON "public"."approval_requests" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_approval_steps_request" ON "public"."approval_steps" USING "btree" ("approval_request_id");



CREATE INDEX "idx_audit_org" ON "public"."audit_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_business_units_org" ON "public"."business_units" USING "btree" ("organization_id");



CREATE INDEX "idx_cold_storages_org" ON "public"."cold_storages" USING "btree" ("organization_id");



CREATE INDEX "idx_cold_storages_warehouse" ON "public"."cold_storages" USING "btree" ("warehouse_id");



CREATE INDEX "idx_customers_org" ON "public"."customers" USING "btree" ("organization_id");



CREATE INDEX "idx_memberships_org" ON "public"."organization_memberships" USING "btree" ("organization_id");



CREATE INDEX "idx_memberships_user" ON "public"."organization_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_product_categories_org" ON "public"."product_categories" USING "btree" ("organization_id");



CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category_id");



CREATE INDEX "idx_products_org" ON "public"."products" USING "btree" ("organization_id");



CREATE INDEX "idx_products_sku" ON "public"."products" USING "btree" ("sku");



CREATE INDEX "idx_storage_locations_cold_storage" ON "public"."storage_locations" USING "btree" ("cold_storage_id");



CREATE INDEX "idx_storage_locations_org" ON "public"."storage_locations" USING "btree" ("organization_id");



CREATE INDEX "idx_suppliers_org" ON "public"."suppliers" USING "btree" ("organization_id");



CREATE INDEX "idx_units_org" ON "public"."units" USING "btree" ("organization_id");



CREATE INDEX "idx_warehouses_business_unit" ON "public"."warehouses" USING "btree" ("business_unit_id");



CREATE INDEX "idx_warehouses_org" ON "public"."warehouses" USING "btree" ("organization_id");



CREATE OR REPLACE TRIGGER "approval_requests_updated_at" BEFORE UPDATE ON "public"."approval_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "memberships_updated_at" BEFORE UPDATE ON "public"."organization_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_business_units_updated_at" BEFORE UPDATE ON "public"."business_units" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cold_storages_updated_at" BEFORE UPDATE ON "public"."cold_storages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_product_categories_updated_at" BEFORE UPDATE ON "public"."product_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_storage_locations_updated_at" BEFORE UPDATE ON "public"."storage_locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_units_updated_at" BEFORE UPDATE ON "public"."units" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_warehouses_updated_at" BEFORE UPDATE ON "public"."warehouses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."approval_actions"
    ADD CONSTRAINT "approval_actions_acted_by_fkey" FOREIGN KEY ("acted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."approval_actions"
    ADD CONSTRAINT "approval_actions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_actions"
    ADD CONSTRAINT "approval_actions_approval_step_id_fkey" FOREIGN KEY ("approval_step_id") REFERENCES "public"."approval_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_requests"
    ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."approval_steps"
    ADD CONSTRAINT "approval_steps_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_steps"
    ADD CONSTRAINT "approval_steps_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."approval_steps"
    ADD CONSTRAINT "approval_steps_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."business_units"
    ADD CONSTRAINT "business_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cold_storages"
    ADD CONSTRAINT "cold_storages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cold_storages"
    ADD CONSTRAINT "cold_storages_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."organization_memberships"
    ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."storage_locations"
    ADD CONSTRAINT "storage_locations_cold_storage_id_fkey" FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."storage_locations"
    ADD CONSTRAINT "storage_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."suppliers"
    ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."units"
    ADD CONSTRAINT "units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE "public"."approval_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approval_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated users can view permissions" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated users can view role permissions" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "authenticated users can view roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."business_units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "business_units_manage" ON "public"."business_units" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));



CREATE POLICY "business_units_select" ON "public"."business_units" FOR SELECT USING ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."cold_storages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cold_storages_manage" ON "public"."cold_storages" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));



CREATE POLICY "cold_storages_select" ON "public"."cold_storages" FOR SELECT USING ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_manage" ON "public"."customers" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));



CREATE POLICY "customers_select" ON "public"."customers" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "members can view approval actions" ON "public"."approval_actions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."approval_requests" "ar"
  WHERE (("ar"."id" = "approval_actions"."approval_request_id") AND "public"."is_org_member"("ar"."organization_id")))));



CREATE POLICY "members can view approval requests" ON "public"."approval_requests" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "members can view approval steps" ON "public"."approval_steps" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."approval_requests" "ar"
  WHERE (("ar"."id" = "approval_steps"."approval_request_id") AND "public"."is_org_member"("ar"."organization_id")))));



CREATE POLICY "members can view audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("organization_id" IS NOT NULL) AND "public"."is_org_member"("organization_id")));



CREATE POLICY "members can view organization memberships" ON "public"."organization_memberships" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "members can view organizations" ON "public"."organizations" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("id"));



ALTER TABLE "public"."organization_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "product_categories_manage" ON "public"."product_categories" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));



CREATE POLICY "product_categories_select" ON "public"."product_categories" FOR SELECT USING ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_manage" ON "public"."products" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));



CREATE POLICY "products_select" ON "public"."products" FOR SELECT USING ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storage_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "storage_locations_manage" ON "public"."storage_locations" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));



CREATE POLICY "storage_locations_select" ON "public"."storage_locations" FOR SELECT USING ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "suppliers_manage" ON "public"."suppliers" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));



CREATE POLICY "suppliers_select" ON "public"."suppliers" FOR SELECT USING ("public"."is_org_member"("organization_id"));



ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "units_manage" ON "public"."units" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));



CREATE POLICY "units_select" ON "public"."units" FOR SELECT USING ("public"."is_org_member"("organization_id"));



CREATE POLICY "users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "warehouses_manage" ON "public"."warehouses" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));



CREATE POLICY "warehouses_select" ON "public"."warehouses" FOR SELECT USING ("public"."is_org_member"("organization_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_director"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_director"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_director"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."approval_actions" TO "anon";
GRANT ALL ON TABLE "public"."approval_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_actions" TO "service_role";



GRANT ALL ON TABLE "public"."approval_requests" TO "anon";
GRANT ALL ON TABLE "public"."approval_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_requests" TO "service_role";



GRANT ALL ON TABLE "public"."approval_steps" TO "anon";
GRANT ALL ON TABLE "public"."approval_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_steps" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."business_units" TO "anon";
GRANT ALL ON TABLE "public"."business_units" TO "authenticated";
GRANT ALL ON TABLE "public"."business_units" TO "service_role";



GRANT ALL ON TABLE "public"."cold_storages" TO "anon";
GRANT ALL ON TABLE "public"."cold_storages" TO "authenticated";
GRANT ALL ON TABLE "public"."cold_storages" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."organization_memberships" TO "anon";
GRANT ALL ON TABLE "public"."organization_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."product_categories" TO "anon";
GRANT ALL ON TABLE "public"."product_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."product_categories" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."storage_locations" TO "anon";
GRANT ALL ON TABLE "public"."storage_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."storage_locations" TO "service_role";



GRANT ALL ON TABLE "public"."suppliers" TO "anon";
GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."units" TO "anon";
GRANT ALL ON TABLE "public"."units" TO "authenticated";
GRANT ALL ON TABLE "public"."units" TO "service_role";



GRANT ALL ON TABLE "public"."warehouses" TO "anon";
GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
GRANT ALL ON TABLE "public"."warehouses" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







