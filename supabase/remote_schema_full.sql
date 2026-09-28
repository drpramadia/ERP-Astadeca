1|
2|
3|
4|SET statement_timeout = 0;
5|SET lock_timeout = 0;
6|SET idle_in_transaction_session_timeout = 0;
7|SET client_encoding = 'UTF8';
8|SET standard_conforming_strings = on;
9|SELECT pg_catalog.set_config('search_path', '', false);
10|SET check_function_bodies = false;
11|SET xmloption = content;
12|SET client_min_messages = warning;
13|SET row_security = off;
14|
15|
16|CREATE SCHEMA IF NOT EXISTS "public";
17|
18|
19|ALTER SCHEMA "public" OWNER TO "pg_database_owner";
20|
21|
22|COMMENT ON SCHEMA "public" IS 'standard public schema';
23|
24|
25|
26|CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
27|    LANGUAGE "plpgsql" SECURITY DEFINER
28|    SET "search_path" TO 'public'
29|    AS $$
30|begin
31|
32|  insert into public.profiles (
33|    id,
34|    full_name,
35|    phone
36|  )
37|  values (
38|    new.id,
39|    coalesce(
40|      new.raw_user_meta_data ->> 'full_name',
41|      new.raw_user_meta_data ->> 'name'
42|    ),
43|    new.raw_user_meta_data ->> 'phone'
44|  )
45|  on conflict (id) do nothing;
46|
47|  return new;
48|
49|end;
50|$$;
51|
52|
53|ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";
54|
55|
56|CREATE OR REPLACE FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") RETURNS boolean
57|    LANGUAGE "sql" STABLE SECURITY DEFINER
58|    SET "search_path" TO 'public'
59|    AS $$
60|  select
61|    exists (
62|      select 1
63|      from public.organization_memberships om
64|      join public.roles r
65|        on r.id = om.role_id
66|      join public.role_permissions rp
67|        on rp.role_id = r.id
68|      join public.permissions p
69|        on p.id = rp.permission_id
70|      where om.organization_id = p_org_id
71|        and om.user_id = auth.uid()
72|        and om.is_active = true
73|        and p.code = p_permission_code
74|    )
75|    or
76|    exists (
77|      select 1
78|      from public.organization_memberships om
79|      join public.roles r
80|        on r.id = om.role_id
81|      where om.organization_id = p_org_id
82|        and om.user_id = auth.uid()
83|        and om.is_active = true
84|        and r.code = 'DIRECTOR'
85|    );
86|$$;
87|
88|
89|ALTER FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") OWNER TO "postgres";
90|
91|
92|CREATE OR REPLACE FUNCTION "public"."is_org_director"("p_org_id" "uuid") RETURNS boolean
93|    LANGUAGE "sql" STABLE SECURITY DEFINER
94|    SET "search_path" TO 'public'
95|    AS $$
96|  select exists (
97|    select 1
98|    from public.organization_memberships m
99|    join public.roles r
100|      on r.id = m.role_id
101|    where m.organization_id = p_org_id
102|      and m.user_id = auth.uid()
103|      and m.is_active = true
104|      and r.code = 'DIRECTOR'
105|  );
106|$$;
107|
108|
109|ALTER FUNCTION "public"."is_org_director"("p_org_id" "uuid") OWNER TO "postgres";
110|
111|
112|CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_org_id" "uuid") RETURNS boolean
113|    LANGUAGE "sql" STABLE SECURITY DEFINER
114|    SET "search_path" TO 'public'
115|    AS $$
116|  select exists (
117|    select 1
118|    from public.organization_memberships m
119|    where m.organization_id = p_org_id
120|      and m.user_id = auth.uid()
121|      and m.is_active = true
122|  );
123|$$;
124|
125|
126|ALTER FUNCTION "public"."is_org_member"("p_org_id" "uuid") OWNER TO "postgres";
127|
128|
129|CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
130|    LANGUAGE "plpgsql"
131|    AS $$
132|begin
133|  new.updated_at = now();
134|  return new;
135|end;
136|$$;
137|
138|
139|ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";
140|
141|SET default_tablespace = '';
142|
143|SET default_table_access_method = "heap";
144|
145|
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
159|
160|
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
179|
180|
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
195|
196|
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
212|
213|
214|CREATE TABLE IF NOT EXISTS "public"."business_units" (
215|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
216|    "organization_id" "uuid" NOT NULL,
217|    "code" "text" NOT NULL,
218|    "name" "text" NOT NULL,
219|    "unit_type" "text" DEFAULT 'BUSINESS_UNIT'::"text" NOT NULL,
220|    "description" "text",
221|    "phone" "text",
222|    "email" "text",
223|    "address" "text",
224|    "logo_path" "text",
225|    "active" boolean DEFAULT true NOT NULL,
226|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
227|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
228|    CONSTRAINT "business_units_unit_type_check" CHECK (("unit_type" = ANY (ARRAY['OPERATING_UNIT'::"text", 'BUSINESS_UNIT'::"text", 'BRANCH'::"text", 'DIVISION'::"text"])))
229|);
230|
231|
232|ALTER TABLE "public"."business_units" OWNER TO "postgres";
233|
234|
235|CREATE TABLE IF NOT EXISTS "public"."cold_storages" (
236|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
237|    "organization_id" "uuid" NOT NULL,
238|    "warehouse_id" "uuid" NOT NULL,
239|    "code" "text" NOT NULL,
240|    "name" "text" NOT NULL,
241|    "capacity_kg" numeric(14,2) DEFAULT 0 NOT NULL,
242|    "temperature_min_c" numeric(6,2),
243|    "temperature_max_c" numeric(6,2),
244|    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
245|    "description" "text",
246|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
247|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
248|    CONSTRAINT "cold_storages_capacity_kg_check" CHECK (("capacity_kg" >= (0)::numeric)),
249|    CONSTRAINT "cold_storages_status_check" CHECK (("status" = ANY (ARRAY['ACTIVE'::"text", 'MAINTENANCE'::"text", 'INACTIVE'::"text"])))
250|);
251|
252|
253|ALTER TABLE "public"."cold_storages" OWNER TO "postgres";
254|
255|
256|CREATE TABLE IF NOT EXISTS "public"."customers" (
257|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
258|    "organization_id" "uuid" NOT NULL,
259|    "code" "text" NOT NULL,
260|    "name" "text" NOT NULL,
261|    "customer_type" "text",
262|    "contact_person" "text",
263|    "phone" "text",
264|    "email" "text",
265|    "address" "text",
266|    "tax_id" "text",
267|    "is_supply_chain_customer" boolean DEFAULT true NOT NULL,
268|    "is_rental_customer" boolean DEFAULT false NOT NULL,
269|    "payment_terms_days" integer DEFAULT 0 NOT NULL,
270|    "active" boolean DEFAULT true NOT NULL,
271|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
272|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
273|    CONSTRAINT "customers_payment_terms_days_check" CHECK (("payment_terms_days" >= 0))
274|);
275|
276|
277|ALTER TABLE "public"."customers" OWNER TO "postgres";
278|
279|
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
292|
293|
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
310|
311|
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
323|
324|
325|CREATE TABLE IF NOT EXISTS "public"."product_categories" (
326|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
327|    "organization_id" "uuid" NOT NULL,
328|    "code" "text" NOT NULL,
329|    "name" "text" NOT NULL,
330|    "description" "text",
331|    "active" boolean DEFAULT true NOT NULL,
332|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
333|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
334|);
335|
336|
337|ALTER TABLE "public"."product_categories" OWNER TO "postgres";
338|
339|
340|CREATE TABLE IF NOT EXISTS "public"."products" (
341|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
342|    "organization_id" "uuid" NOT NULL,
343|    "category_id" "uuid",
344|    "unit_id" "uuid",
345|    "sku" "text" NOT NULL,
346|    "name" "text" NOT NULL,
347|    "description" "text",
348|    "brand" "text",
349|    "purchase_price" numeric(16,2) DEFAULT 0 NOT NULL,
350|    "selling_price" numeric(16,2) DEFAULT 0 NOT NULL,
351|    "min_stock" numeric(14,2) DEFAULT 0 NOT NULL,
352|    "max_stock" numeric(14,2),
353|    "track_batch" boolean DEFAULT true NOT NULL,
354|    "track_expiry" boolean DEFAULT true NOT NULL,
355|    "active" boolean DEFAULT true NOT NULL,
356|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
357|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
358|    CONSTRAINT "products_min_stock_check" CHECK (("min_stock" >= (0)::numeric)),
359|    CONSTRAINT "products_purchase_price_check" CHECK (("purchase_price" >= (0)::numeric)),
360|    CONSTRAINT "products_selling_price_check" CHECK (("selling_price" >= (0)::numeric))
361|);
362|
363|
364|ALTER TABLE "public"."products" OWNER TO "postgres";
365|
366|
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
379|
380|
381|CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
382|    "role_id" "uuid" NOT NULL,
383|    "permission_id" "uuid" NOT NULL,
384|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
385|);
386|
387|
388|ALTER TABLE "public"."role_permissions" OWNER TO "postgres";
389|
390|
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
402|
403|
404|CREATE TABLE IF NOT EXISTS "public"."storage_locations" (
405|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
406|    "organization_id" "uuid" NOT NULL,
407|    "cold_storage_id" "uuid" NOT NULL,
408|    "code" "text" NOT NULL,
409|    "name" "text" NOT NULL,
410|    "aisle" "text",
411|    "rack" "text",
412|    "level" "text",
413|    "capacity_kg" numeric(14,2) DEFAULT 0 NOT NULL,
414|    "active" boolean DEFAULT true NOT NULL,
415|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
416|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
417|    CONSTRAINT "storage_locations_capacity_kg_check" CHECK (("capacity_kg" >= (0)::numeric))
418|);
419|
420|
421|ALTER TABLE "public"."storage_locations" OWNER TO "postgres";
422|
423|
424|CREATE TABLE IF NOT EXISTS "public"."suppliers" (
425|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
426|    "organization_id" "uuid" NOT NULL,
427|    "code" "text" NOT NULL,
428|    "name" "text" NOT NULL,
429|    "supplier_type" "text",
430|    "contact_person" "text",
431|    "phone" "text",
432|    "email" "text",
433|    "address" "text",
434|    "tax_id" "text",
435|    "payment_terms_days" integer DEFAULT 0 NOT NULL,
436|    "active" boolean DEFAULT true NOT NULL,
437|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
438|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
439|    CONSTRAINT "suppliers_payment_terms_days_check" CHECK (("payment_terms_days" >= 0))
440|);
441|
442|
443|ALTER TABLE "public"."suppliers" OWNER TO "postgres";
444|
445|
446|CREATE TABLE IF NOT EXISTS "public"."units" (
447|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
448|    "organization_id" "uuid" NOT NULL,
449|    "code" "text" NOT NULL,
450|    "name" "text" NOT NULL,
451|    "description" "text",
452|    "active" boolean DEFAULT true NOT NULL,
453|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
454|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
455|);
456|
457|
458|ALTER TABLE "public"."units" OWNER TO "postgres";
459|
460|
461|CREATE TABLE IF NOT EXISTS "public"."warehouses" (
462|    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
463|    "organization_id" "uuid" NOT NULL,
464|    "business_unit_id" "uuid",
465|    "code" "text" NOT NULL,
466|    "name" "text" NOT NULL,
467|    "warehouse_type" "text" DEFAULT 'COLD_STORAGE'::"text" NOT NULL,
468|    "address" "text",
469|    "description" "text",
470|    "active" boolean DEFAULT true NOT NULL,
471|    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
472|    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
473|    CONSTRAINT "warehouses_warehouse_type_check" CHECK (("warehouse_type" = ANY (ARRAY['COLD_STORAGE'::"text", 'DRY_STORAGE'::"text", 'STAGING'::"text", 'QUARANTINE'::"text", 'OTHER'::"text"])))
474|);
475|
476|
477|ALTER TABLE "public"."warehouses" OWNER TO "postgres";
478|
479|
480|ALTER TABLE ONLY "public"."approval_actions"
481|    ADD CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id");
482|
483|
484|
485|ALTER TABLE ONLY "public"."approval_requests"
486|    ADD CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id");
487|
488|
489|
490|ALTER TABLE ONLY "public"."approval_steps"
491|    ADD CONSTRAINT "approval_steps_approval_request_id_step_number_key" UNIQUE ("approval_request_id", "step_number");
492|
493|
494|
495|ALTER TABLE ONLY "public"."approval_steps"
496|    ADD CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id");
497|
498|
499|
500|ALTER TABLE ONLY "public"."audit_logs"
501|    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");
502|
503|
504|
505|ALTER TABLE ONLY "public"."business_units"
506|    ADD CONSTRAINT "business_units_org_code_unique" UNIQUE ("organization_id", "code");
507|
508|
509|
510|ALTER TABLE ONLY "public"."business_units"
511|    ADD CONSTRAINT "business_units_pkey" PRIMARY KEY ("id");
512|
513|
514|
515|ALTER TABLE ONLY "public"."cold_storages"
516|    ADD CONSTRAINT "cold_storages_org_code_unique" UNIQUE ("organization_id", "code");
517|
518|
519|
520|ALTER TABLE ONLY "public"."cold_storages"
521|    ADD CONSTRAINT "cold_storages_pkey" PRIMARY KEY ("id");
522|
523|
524|
525|ALTER TABLE ONLY "public"."customers"
526|    ADD CONSTRAINT "customers_org_code_unique" UNIQUE ("organization_id", "code");
527|
528|
529|
530|ALTER TABLE ONLY "public"."customers"
531|    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");
532|
533|
534|
535|ALTER TABLE ONLY "public"."organization_memberships"
536|    ADD CONSTRAINT "organization_memberships_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");
537|
538|
539|
540|ALTER TABLE ONLY "public"."organization_memberships"
541|    ADD CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id");
542|
543|
544|
545|ALTER TABLE ONLY "public"."organizations"
546|    ADD CONSTRAINT "organizations_code_key" UNIQUE ("code");
547|
548|
549|
550|ALTER TABLE ONLY "public"."organizations"
551|    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");
552|
553|
554|
555|ALTER TABLE ONLY "public"."permissions"
556|    ADD CONSTRAINT "permissions_code_key" UNIQUE ("code");
557|
558|
559|
560|ALTER TABLE ONLY "public"."permissions"
561|    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");
562|
563|
564|
565|ALTER TABLE ONLY "public"."product_categories"
566|    ADD CONSTRAINT "product_categories_org_code_unique" UNIQUE ("organization_id", "code");
567|
568|
569|
570|ALTER TABLE ONLY "public"."product_categories"
571|    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id");
572|
573|
574|
575|ALTER TABLE ONLY "public"."products"
576|    ADD CONSTRAINT "products_org_sku_unique" UNIQUE ("organization_id", "sku");
577|
578|
579|
580|ALTER TABLE ONLY "public"."products"
581|    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");
582|
583|
584|
585|ALTER TABLE ONLY "public"."profiles"
586|    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");
587|
588|
589|
590|ALTER TABLE ONLY "public"."role_permissions"
591|    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id");
592|
593|
594|
595|ALTER TABLE ONLY "public"."roles"
596|    ADD CONSTRAINT "roles_code_key" UNIQUE ("code");
597|
598|
599|
600|ALTER TABLE ONLY "public"."roles"
601|    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");
602|
603|
604|
605|ALTER TABLE ONLY "public"."storage_locations"
606|    ADD CONSTRAINT "storage_locations_cs_code_unique" UNIQUE ("cold_storage_id", "code");
607|
608|
609|
610|ALTER TABLE ONLY "public"."storage_locations"
611|    ADD CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id");
612|
613|
614|
615|ALTER TABLE ONLY "public"."suppliers"
616|    ADD CONSTRAINT "suppliers_org_code_unique" UNIQUE ("organization_id", "code");
617|
618|
619|
620|ALTER TABLE ONLY "public"."suppliers"
621|    ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id");
622|
623|
624|
625|ALTER TABLE ONLY "public"."units"
626|    ADD CONSTRAINT "units_org_code_unique" UNIQUE ("organization_id", "code");
627|
628|
629|
630|ALTER TABLE ONLY "public"."units"
631|    ADD CONSTRAINT "units_pkey" PRIMARY KEY ("id");
632|
633|
634|
635|ALTER TABLE ONLY "public"."warehouses"
636|    ADD CONSTRAINT "warehouses_org_code_unique" UNIQUE ("organization_id", "code");
637|
638|
639|
640|ALTER TABLE ONLY "public"."warehouses"
641|    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");
642|
643|
644|
645|CREATE INDEX "idx_approval_entity" ON "public"."approval_requests" USING "btree" ("entity_type", "entity_id");
646|
647|
648|
649|CREATE INDEX "idx_approval_org_status" ON "public"."approval_requests" USING "btree" ("organization_id", "status");
650|
651|
652|
653|CREATE INDEX "idx_approval_steps_request" ON "public"."approval_steps" USING "btree" ("approval_request_id");
654|
655|
656|
657|CREATE INDEX "idx_audit_org" ON "public"."audit_logs" USING "btree" ("organization_id", "created_at" DESC);
658|
659|
660|
661|CREATE INDEX "idx_business_units_org" ON "public"."business_units" USING "btree" ("organization_id");
662|
663|
664|
665|CREATE INDEX "idx_cold_storages_org" ON "public"."cold_storages" USING "btree" ("organization_id");
666|
667|
668|
669|CREATE INDEX "idx_cold_storages_warehouse" ON "public"."cold_storages" USING "btree" ("warehouse_id");
670|
671|
672|
673|CREATE INDEX "idx_customers_org" ON "public"."customers" USING "btree" ("organization_id");
674|
675|
676|
677|CREATE INDEX "idx_memberships_org" ON "public"."organization_memberships" USING "btree" ("organization_id");
678|
679|
680|
681|CREATE INDEX "idx_memberships_user" ON "public"."organization_memberships" USING "btree" ("user_id");
682|
683|
684|
685|CREATE INDEX "idx_product_categories_org" ON "public"."product_categories" USING "btree" ("organization_id");
686|
687|
688|
689|CREATE INDEX "idx_products_category" ON "public"."products" USING "btree" ("category_id");
690|
691|
692|
693|CREATE INDEX "idx_products_org" ON "public"."products" USING "btree" ("organization_id");
694|
695|
696|
697|CREATE INDEX "idx_products_sku" ON "public"."products" USING "btree" ("sku");
698|
699|
700|
701|CREATE INDEX "idx_storage_locations_cold_storage" ON "public"."storage_locations" USING "btree" ("cold_storage_id");
702|
703|
704|
705|CREATE INDEX "idx_storage_locations_org" ON "public"."storage_locations" USING "btree" ("organization_id");
706|
707|
708|
709|CREATE INDEX "idx_suppliers_org" ON "public"."suppliers" USING "btree" ("organization_id");
710|
711|
712|
713|CREATE INDEX "idx_units_org" ON "public"."units" USING "btree" ("organization_id");
714|
715|
716|
717|CREATE INDEX "idx_warehouses_business_unit" ON "public"."warehouses" USING "btree" ("business_unit_id");
718|
719|
720|
721|CREATE INDEX "idx_warehouses_org" ON "public"."warehouses" USING "btree" ("organization_id");
722|
723|
724|
725|CREATE OR REPLACE TRIGGER "approval_requests_updated_at" BEFORE UPDATE ON "public"."approval_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
726|
727|
728|
729|CREATE OR REPLACE TRIGGER "memberships_updated_at" BEFORE UPDATE ON "public"."organization_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
730|
731|
732|
733|CREATE OR REPLACE TRIGGER "organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
734|
735|
736|
737|CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
738|
739|
740|
741|CREATE OR REPLACE TRIGGER "trg_business_units_updated_at" BEFORE UPDATE ON "public"."business_units" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
742|
743|
744|
745|CREATE OR REPLACE TRIGGER "trg_cold_storages_updated_at" BEFORE UPDATE ON "public"."cold_storages" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
746|
747|
748|
749|CREATE OR REPLACE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
750|
751|
752|
753|CREATE OR REPLACE TRIGGER "trg_product_categories_updated_at" BEFORE UPDATE ON "public"."product_categories" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
754|
755|
756|
757|CREATE OR REPLACE TRIGGER "trg_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
758|
759|
760|
761|CREATE OR REPLACE TRIGGER "trg_storage_locations_updated_at" BEFORE UPDATE ON "public"."storage_locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
762|
763|
764|
765|CREATE OR REPLACE TRIGGER "trg_suppliers_updated_at" BEFORE UPDATE ON "public"."suppliers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
766|
767|
768|
769|CREATE OR REPLACE TRIGGER "trg_units_updated_at" BEFORE UPDATE ON "public"."units" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
770|
771|
772|
773|CREATE OR REPLACE TRIGGER "trg_warehouses_updated_at" BEFORE UPDATE ON "public"."warehouses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
774|
775|
776|
777|ALTER TABLE ONLY "public"."approval_actions"
778|    ADD CONSTRAINT "approval_actions_acted_by_fkey" FOREIGN KEY ("acted_by") REFERENCES "public"."profiles"("id");
779|
780|
781|
782|ALTER TABLE ONLY "public"."approval_actions"
783|    ADD CONSTRAINT "approval_actions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE CASCADE;
784|
785|
786|
787|ALTER TABLE ONLY "public"."approval_actions"
788|    ADD CONSTRAINT "approval_actions_approval_step_id_fkey" FOREIGN KEY ("approval_step_id") REFERENCES "public"."approval_steps"("id") ON DELETE CASCADE;
789|
790|
791|
792|ALTER TABLE ONLY "public"."approval_requests"
793|    ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
794|
795|
796|
797|ALTER TABLE ONLY "public"."approval_requests"
798|    ADD CONSTRAINT "approval_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id");
799|
800|
801|
802|ALTER TABLE ONLY "public"."approval_steps"
803|    ADD CONSTRAINT "approval_steps_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE CASCADE;
804|
805|
806|
807|ALTER TABLE ONLY "public"."approval_steps"
808|    ADD CONSTRAINT "approval_steps_approver_role_id_fkey" FOREIGN KEY ("approver_role_id") REFERENCES "public"."roles"("id");
809|
810|
811|
812|ALTER TABLE ONLY "public"."approval_steps"
813|    ADD CONSTRAINT "approval_steps_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."profiles"("id");
814|
815|
816|
817|ALTER TABLE ONLY "public"."audit_logs"
818|    ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;
819|
820|
821|
822|ALTER TABLE ONLY "public"."audit_logs"
823|    ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;
824|
825|
826|
827|ALTER TABLE ONLY "public"."business_units"
828|    ADD CONSTRAINT "business_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
829|
830|
831|
832|ALTER TABLE ONLY "public"."cold_storages"
833|    ADD CONSTRAINT "cold_storages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
834|
835|
836|
837|ALTER TABLE ONLY "public"."cold_storages"
838|    ADD CONSTRAINT "cold_storages_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE RESTRICT;
839|
840|
841|
842|ALTER TABLE ONLY "public"."customers"
843|    ADD CONSTRAINT "customers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
844|
845|
846|
847|ALTER TABLE ONLY "public"."organization_memberships"
848|    ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
849|
850|
851|
852|ALTER TABLE ONLY "public"."organization_memberships"
853|    ADD CONSTRAINT "organization_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");
854|
855|
856|
857|ALTER TABLE ONLY "public"."organization_memberships"
858|    ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;
859|
860|
861|
862|ALTER TABLE ONLY "public"."product_categories"
863|    ADD CONSTRAINT "product_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
864|
865|
866|
867|ALTER TABLE ONLY "public"."products"
868|    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE RESTRICT;
869|
870|
871|
872|ALTER TABLE ONLY "public"."products"
873|    ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
874|
875|
876|
877|ALTER TABLE ONLY "public"."products"
878|    ADD CONSTRAINT "products_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE RESTRICT;
879|
880|
881|
882|ALTER TABLE ONLY "public"."profiles"
883|    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
884|
885|
886|
887|ALTER TABLE ONLY "public"."role_permissions"
888|    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;
889|
890|
891|
892|ALTER TABLE ONLY "public"."role_permissions"
893|    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;
894|
895|
896|
897|ALTER TABLE ONLY "public"."storage_locations"
898|    ADD CONSTRAINT "storage_locations_cold_storage_id_fkey" FOREIGN KEY ("cold_storage_id") REFERENCES "public"."cold_storages"("id") ON DELETE RESTRICT;
899|
900|
901|
902|ALTER TABLE ONLY "public"."storage_locations"
903|    ADD CONSTRAINT "storage_locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
904|
905|
906|
907|ALTER TABLE ONLY "public"."suppliers"
908|    ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
909|
910|
911|
912|ALTER TABLE ONLY "public"."units"
913|    ADD CONSTRAINT "units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
914|
915|
916|
917|ALTER TABLE ONLY "public"."warehouses"
918|    ADD CONSTRAINT "warehouses_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "public"."business_units"("id") ON DELETE RESTRICT;
919|
920|
921|
922|ALTER TABLE ONLY "public"."warehouses"
923|    ADD CONSTRAINT "warehouses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;
924|
925|
926|
927|ALTER TABLE "public"."approval_actions" ENABLE ROW LEVEL SECURITY;
928|
929|
930|ALTER TABLE "public"."approval_requests" ENABLE ROW LEVEL SECURITY;
931|
932|
933|ALTER TABLE "public"."approval_steps" ENABLE ROW LEVEL SECURITY;
934|
935|
936|ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
937|
938|
939|CREATE POLICY "authenticated users can view permissions" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);
940|
941|
942|
943|CREATE POLICY "authenticated users can view role permissions" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (true);
944|
945|
946|
947|CREATE POLICY "authenticated users can view roles" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);
948|
949|
950|
951|ALTER TABLE "public"."business_units" ENABLE ROW LEVEL SECURITY;
952|
953|
954|CREATE POLICY "business_units_manage" ON "public"."business_units" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));
955|
956|
957|
958|CREATE POLICY "business_units_select" ON "public"."business_units" FOR SELECT USING ("public"."is_org_member"("organization_id"));
959|
960|
961|
962|ALTER TABLE "public"."cold_storages" ENABLE ROW LEVEL SECURITY;
963|
964|
965|CREATE POLICY "cold_storages_manage" ON "public"."cold_storages" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));
966|
967|
968|
969|CREATE POLICY "cold_storages_select" ON "public"."cold_storages" FOR SELECT USING ("public"."is_org_member"("organization_id"));
970|
971|
972|
973|ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;
974|
975|
976|CREATE POLICY "customers_manage" ON "public"."customers" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));
977|
978|
979|
980|CREATE POLICY "customers_select" ON "public"."customers" FOR SELECT USING ("public"."is_org_member"("organization_id"));
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
1019|
1020|
1021|ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;
1022|
1023|
1024|CREATE POLICY "product_categories_manage" ON "public"."product_categories" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));
1025|
1026|
1027|
1028|CREATE POLICY "product_categories_select" ON "public"."product_categories" FOR SELECT USING ("public"."is_org_member"("organization_id"));
1029|
1030|
1031|
1032|ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;
1033|
1034|
1035|CREATE POLICY "products_manage" ON "public"."products" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));
1036|
1037|
1038|
1039|CREATE POLICY "products_select" ON "public"."products" FOR SELECT USING ("public"."is_org_member"("organization_id"));
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
1050|
1051|
1052|ALTER TABLE "public"."storage_locations" ENABLE ROW LEVEL SECURITY;
1053|
1054|
1055|CREATE POLICY "storage_locations_manage" ON "public"."storage_locations" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));
1056|
1057|
1058|
1059|CREATE POLICY "storage_locations_select" ON "public"."storage_locations" FOR SELECT USING ("public"."is_org_member"("organization_id"));
1060|
1061|
1062|
1063|ALTER TABLE "public"."suppliers" ENABLE ROW LEVEL SECURITY;
1064|
1065|
1066|CREATE POLICY "suppliers_manage" ON "public"."suppliers" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));
1067|
1068|
1069|
1070|CREATE POLICY "suppliers_select" ON "public"."suppliers" FOR SELECT USING ("public"."is_org_member"("organization_id"));
1071|
1072|
1073|
1074|ALTER TABLE "public"."units" ENABLE ROW LEVEL SECURITY;
1075|
1076|
1077|CREATE POLICY "units_manage" ON "public"."units" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));
1078|
1079|
1080|
1081|CREATE POLICY "units_select" ON "public"."units" FOR SELECT USING ("public"."is_org_member"("organization_id"));
1082|
1083|
1084|
1085|CREATE POLICY "users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));
1086|
1087|
1088|
1089|ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;
1090|
1091|
1092|CREATE POLICY "warehouses_manage" ON "public"."warehouses" USING ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text")) WITH CHECK ("public"."has_org_permission"("organization_id", 'admin.master_data'::"text"));
1093|
1094|
1095|
1096|CREATE POLICY "warehouses_select" ON "public"."warehouses" FOR SELECT USING ("public"."is_org_member"("organization_id"));
1097|
1098|
1099|
1100|GRANT USAGE ON SCHEMA "public" TO "postgres";
1101|GRANT USAGE ON SCHEMA "public" TO "anon";
1102|GRANT USAGE ON SCHEMA "public" TO "authenticated";
1103|GRANT USAGE ON SCHEMA "public" TO "service_role";
1104|
1105|
1106|
1107|GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
1108|GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
1109|GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";
1110|
1111|
1112|
1113|GRANT ALL ON FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") TO "anon";
1114|GRANT ALL ON FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") TO "authenticated";
1115|GRANT ALL ON FUNCTION "public"."has_org_permission"("p_org_id" "uuid", "p_permission_code" "text") TO "service_role";
1116|
1117|
1118|
1119|GRANT ALL ON FUNCTION "public"."is_org_director"("p_org_id" "uuid") TO "anon";
1120|GRANT ALL ON FUNCTION "public"."is_org_director"("p_org_id" "uuid") TO "authenticated";
1121|GRANT ALL ON FUNCTION "public"."is_org_director"("p_org_id" "uuid") TO "service_role";
1122|
1123|
1124|
1125|GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "anon";
1126|GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "authenticated";
1127|GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "service_role";
1128|
1129|
1130|
1131|GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
1132|GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
1133|GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";
1134|
1135|
1136|
1137|GRANT ALL ON TABLE "public"."approval_actions" TO "anon";
1138|GRANT ALL ON TABLE "public"."approval_actions" TO "authenticated";
1139|GRANT ALL ON TABLE "public"."approval_actions" TO "service_role";
1140|
1141|
1142|
1143|GRANT ALL ON TABLE "public"."approval_requests" TO "anon";
1144|GRANT ALL ON TABLE "public"."approval_requests" TO "authenticated";
1145|GRANT ALL ON TABLE "public"."approval_requests" TO "service_role";
1146|
1147|
1148|
1149|GRANT ALL ON TABLE "public"."approval_steps" TO "anon";
1150|GRANT ALL ON TABLE "public"."approval_steps" TO "authenticated";
1151|GRANT ALL ON TABLE "public"."approval_steps" TO "service_role";
1152|
1153|
1154|
1155|GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
1156|GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
1157|GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";
1158|
1159|
1160|
1161|GRANT ALL ON TABLE "public"."business_units" TO "anon";
1162|GRANT ALL ON TABLE "public"."business_units" TO "authenticated";
1163|GRANT ALL ON TABLE "public"."business_units" TO "service_role";
1164|
1165|
1166|
1167|GRANT ALL ON TABLE "public"."cold_storages" TO "anon";
1168|GRANT ALL ON TABLE "public"."cold_storages" TO "authenticated";
1169|GRANT ALL ON TABLE "public"."cold_storages" TO "service_role";
1170|
1171|
1172|
1173|GRANT ALL ON TABLE "public"."customers" TO "anon";
1174|GRANT ALL ON TABLE "public"."customers" TO "authenticated";
1175|GRANT ALL ON TABLE "public"."customers" TO "service_role";
1176|
1177|
1178|
1179|GRANT ALL ON TABLE "public"."organization_memberships" TO "anon";
1180|GRANT ALL ON TABLE "public"."organization_memberships" TO "authenticated";
1181|GRANT ALL ON TABLE "public"."organization_memberships" TO "service_role";
1182|
1183|
1184|
1185|GRANT ALL ON TABLE "public"."organizations" TO "anon";
1186|GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
1187|GRANT ALL ON TABLE "public"."organizations" TO "service_role";
1188|
1189|
1190|
1191|GRANT ALL ON TABLE "public"."permissions" TO "anon";
1192|GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
1193|GRANT ALL ON TABLE "public"."permissions" TO "service_role";
1194|
1195|
1196|
1197|GRANT ALL ON TABLE "public"."product_categories" TO "anon";
1198|GRANT ALL ON TABLE "public"."product_categories" TO "authenticated";
1199|GRANT ALL ON TABLE "public"."product_categories" TO "service_role";
1200|
1201|
1202|
1203|GRANT ALL ON TABLE "public"."products" TO "anon";
1204|GRANT ALL ON TABLE "public"."products" TO "authenticated";
1205|GRANT ALL ON TABLE "public"."products" TO "service_role";
1206|
1207|
1208|
1209|GRANT ALL ON TABLE "public"."profiles" TO "anon";
1210|GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
1211|GRANT ALL ON TABLE "public"."profiles" TO "service_role";
1212|
1213|
1214|
1215|GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
1216|GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
1217|GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";
1218|
1219|
1220|
1221|GRANT ALL ON TABLE "public"."roles" TO "anon";
1222|GRANT ALL ON TABLE "public"."roles" TO "authenticated";
1223|GRANT ALL ON TABLE "public"."roles" TO "service_role";
1224|
1225|
1226|
1227|GRANT ALL ON TABLE "public"."storage_locations" TO "anon";
1228|GRANT ALL ON TABLE "public"."storage_locations" TO "authenticated";
1229|GRANT ALL ON TABLE "public"."storage_locations" TO "service_role";
1230|
1231|
1232|
1233|GRANT ALL ON TABLE "public"."suppliers" TO "anon";
1234|GRANT ALL ON TABLE "public"."suppliers" TO "authenticated";
1235|GRANT ALL ON TABLE "public"."suppliers" TO "service_role";
1236|
1237|
1238|
1239|GRANT ALL ON TABLE "public"."units" TO "anon";
1240|GRANT ALL ON TABLE "public"."units" TO "authenticated";
1241|GRANT ALL ON TABLE "public"."units" TO "service_role";
1242|
1243|
1244|
1245|GRANT ALL ON TABLE "public"."warehouses" TO "anon";
1246|GRANT ALL ON TABLE "public"."warehouses" TO "authenticated";
1247|GRANT ALL ON TABLE "public"."warehouses" TO "service_role";
1248|
1249|
1250|
1251|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
1252|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
1253|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
1254|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";
1255|
1256|
1257|
1258|
1259|
1260|
1261|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
1262|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
1263|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
1264|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";
1265|
1266|
1267|
1268|
1269|
1270|
1271|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
1272|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
1273|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
1274|ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
1275|
1276|
1277|
1278|
1279|
1280|
1281|