-- Migration: 001_foundation.sql
-- Description: Core authentication, organization, and approval infrastructure
-- Generated from remote schema dump
-- Date: 2026-09-26

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Helper function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- Trigger function: Create profile on new user signup
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



-- ============================================
-- TABLE DEFINITIONS
-- ============================================
312|CREATE TABLE IF NOT EXISTS "public"."permissions" (
313|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
314|    "code" "text" NOT NULL,
315|    "name" "text" NOT NULL,
316|    "module" "text" NOT NULL,
317|    "description" "text",
318|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
319|);
320|
321|
322|ALTER TABLE "public"."permissions" OWNER TO "postgres";

391|CREATE TABLE IF NOT EXISTS "public"."roles" (
392|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
393|    "code" "text" NOT NULL,
394|    "name" "text" NOT NULL,
395|    "description" "text",
396|    "is_system" boolean DEFAULT true NOT NULL,
397|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
398|);
399|
400|
401|ALTER TABLE "public"."roles" OWNER TO "postgres";

381|CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
382|    "role_id" "uuid" NOT NULL,
383|    "permission_id" "uuid" NOT NULL,
384|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
385|);
386|
387|
388|ALTER TABLE "public"."role_permissions" OWNER TO "postgres";

367|CREATE TABLE IF NOT EXISTS "public"."profiles" (
368|    "id" "uuid" NOT NULL,
369|    "full_name" "text",
370|    "phone" "text",
371|    "avatar_url" "text",
372|    "is_active" boolean DEFAULT true NOT NULL,
373|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
374|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
375|);
376|
377|
378|ALTER TABLE "public"."profiles" OWNER TO "postgres";

294|CREATE TABLE IF NOT EXISTS "public"."organizations" (
295|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
296|    "name" "text" NOT NULL,
297|    "legal_name" "text",
298|    "code" "text",
299|    "tax_id" "text",
300|    "address" "text",
301|    "phone" "text",
302|    "email" "text",
303|    "is_active" boolean DEFAULT true NOT NULL,
304|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
305|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
306|);
307|
308|
309|ALTER TABLE "public"."organizations" OWNER TO "postgres";

280|CREATE TABLE IF NOT EXISTS "public"."organization_memberships" (
281|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
282|    "organization_id" "uuid" NOT NULL,
283|    "user_id" "uuid" NOT NULL,
284|    "role_id" "uuid" NOT NULL,
285|    "is_active" boolean DEFAULT true NOT NULL,
286|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
287|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
288|);
289|
290|
291|ALTER TABLE "public"."organization_memberships" OWNER TO "postgres";

161|CREATE TABLE IF NOT EXISTS "public"."approval_requests" (
162|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
163|    "organization_id" "uuid" NOT NULL,
164|    "entity_type" "text" NOT NULL,
165|    "entity_id" "uuid" NOT NULL,
166|    "requested_by" "uuid" NOT NULL,
167|    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
168|    "title" "text" NOT NULL,
169|    "description" "text",
170|    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
171|    "completed_at" timestamp with time zone,
172|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
173|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
174|    CONSTRAINT "approval_requests_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text", 'REVISION'::"text", 'CANCELLED'::"text"])))
175|);
176|
177|
178|ALTER TABLE "public"."approval_requests" OWNER TO "postgres";

181|CREATE TABLE IF NOT EXISTS "public"."approval_steps" (
182|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
183|    "approval_request_id" "uuid" NOT NULL,
184|    "step_number" integer NOT NULL,
185|    "approver_role_id" "uuid",
186|    "assigned_user_id" "uuid",
187|    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
188|    "acted_at" timestamp with time zone,
189|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
190|    CONSTRAINT "approval_steps_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'APPROVED'::"text", 'REJECTED'::"text", 'REVISION'::"text", 'SKIPPED'::"text"])))
191|);
192|
193|
194|ALTER TABLE "public"."approval_steps" OWNER TO "postgres";

146|CREATE TABLE IF NOT EXISTS "public"."approval_actions" (
147|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
148|    "approval_request_id" "uuid" NOT NULL,
149|    "approval_step_id" "uuid",
150|    "acted_by" "uuid" NOT NULL,
151|    "action" "text" NOT NULL,
152|    "comment" "text",
153|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
154|    CONSTRAINT "approval_actions_action_check" CHECK (("action" = ANY (ARRAY['APPROVE'::"text", 'REJECT'::"text", 'REQUEST_REVISION'::"text"])))
155|);
156|
157|
158|ALTER TABLE "public"."approval_actions" OWNER TO "postgres";

197|CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
198|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
199|    "organization_id" "uuid",
200|    "actor_user_id" "uuid",
201|    "action" "text" NOT NULL,
202|    "entity_type" "text",
203|    "entity_id" "uuid",
204|    "old_data" "jsonb",
205|    "new_data" "jsonb",
206|    "ip_address" "inet",
207|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
208|);
209|
210|
211|ALTER TABLE "public"."audit_logs" OWNER TO "postgres";

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================
-- Organization memberships
DROP TRIGGER IF EXISTS "organization_memberships_updated_at" ON "public"."organization_memberships";
CREATE TRIGGER "organization_memberships_updated_at"
    BEFORE UPDATE ON "public"."organization_memberships"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


-- ============================================
-- PERMISSION CHECKING FUNCTIONS
-- (Depend on organization_memberships, roles, permissions tables)
-- ============================================
-- Check if current user has a specific permission in an organization
CREATE OR REPLACE FUNCTION "public"."has_org_permission"("p_org_id" "uuid",
  "p_permission_code" "text") RETURNS boolean
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


-- Check if current user is a director in an organization
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


-- Check if current user is a member of an organization
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


-- ============================================
-- INDEXES
-- ============================================
645|CREATE INDEX IF NOT EXISTS "idx_approval_entity" ON "public"."approval_requests" USING "btree" ("entity_type", "entity_id");
649|CREATE INDEX IF NOT EXISTS "idx_approval_org_status" ON "public"."approval_requests" USING "btree" ("organization_id", "status");
653|CREATE INDEX IF NOT EXISTS "idx_approval_steps_request" ON "public"."approval_steps" USING "btree" ("approval_request_id");
657|CREATE INDEX IF NOT EXISTS "idx_audit_org" ON "public"."audit_logs" USING "btree" ("organization_id", "created_at" DESC);
677|CREATE INDEX IF NOT EXISTS "idx_memberships_org" ON "public"."organization_memberships" USING "btree" ("organization_id");
681|CREATE INDEX IF NOT EXISTS "idx_memberships_user" ON "public"."organization_memberships" USING "btree" ("user_id");

-- ============================================
-- FOREIGN KEYS
-- ============================================
778|    ADD CONSTRAINT "approval_actions_acted_by_fkey" FOREIGN KEY ("acted_by") REFERENCES "public"."profiles"("id");
783|    ADD CONSTRAINT "approval_actions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE CASCADE;
788|    ADD CONSTRAINT "approval_actions_approval_step_id_fkey" FOREIGN KEY ("approval_step_id") REFERENCES "public"."approval_steps"("id") ON DELETE CASCADE;
793|    ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
798|    ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");
803|    ADD CONSTRAINT "approval_steps_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE CASCADE;
808|    ADD CONSTRAINT "approval_steps_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "public"."roles"("id");
813|    ADD CONSTRAINT "approval_steps_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."profiles"("id");
818|    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
823|    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;
848|    ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
853|    ADD CONSTRAINT "organization_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");
858|    ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
883|    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
888|    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;
893|    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
1009|
1010|
1011|
1012|ALTER TABLE "public"."organization_memberships" ENABLE ROW LEVEL SECURITY;
1013|
1014|
1015|ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
1016|
1017|
1018|ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;
1040|
1041|
1042|
1043|ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
1044|
1045|
1046|ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;
1047|
1048|
1049|ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================
939|CREATE POLICY "authenticated users can view permissions" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);

940|
941|
942|
943|CREATE POLICY "authenticated users can view role permissions" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);

944|
945|
946|
947|CREATE POLICY "authenticated users can view roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);

981|
982|
983|
984|CREATE POLICY "members can view approval actions" ON "public"."approval_actions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
985|   FROM "public"."approval_requests" "ar"
986|  WHERE (("ar"."id" = "approval_actions"."approval_request_id") AND "public"."is_org_member"("ar"."organization_id")))));

987|
988|
989|
990|CREATE POLICY "members can view approval requests" ON "public"."approval_requests" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id"));

991|
992|
993|
994|CREATE POLICY "members can view approval steps" ON "public"."approval_steps" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
995|   FROM "public"."approval_requests" "ar"
996|  WHERE (("ar"."id" = "approval_steps"."approval_request_id") AND "public"."is_org_member"("ar"."organization_id")))));

997|
998|
999|
1000|CREATE POLICY "members can view audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("organization_id" IS NOT NULL) AND "public"."is_org_member"("organization_id")));

1001|
1002|
1003|
1004|CREATE POLICY "members can view organization memberships" ON "public"."organization_memberships" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("organization_id"));

1005|
1006|
1007|
1008|CREATE POLICY "members can view organizations" ON "public"."organizations" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("id"));

1082|
1083|
1084|
1085|CREATE POLICY "users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));

-- ============================================
-- TRIGGERS
-- ============================================

-- Create trigger for handle_new_user
DROP TRIGGER IF EXISTS "on_auth_user_created" ON "public"."users";
CREATE TRIGGER "on_auth_user_created"
    AFTER INSERT ON "public"."users"
    FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();

