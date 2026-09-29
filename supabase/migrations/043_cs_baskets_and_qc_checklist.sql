-- Migration: 043_cs_baskets_and_qc_checklist.sql
-- Adds per-basket (keranjang) capacity + QC checklist for cold storage receiving
-- Date: 2026-09-29

-- ============================================================
-- 1. Add basket capacity to storage_locations
--    Each keranjang (basket/slot) has its own max capacity (kg)
--    because different goods have different volumes.
-- ============================================================
ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS "capacity_kg" numeric(14,3) DEFAULT 0;

ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS "zone" text DEFAULT 'A';

-- ============================================================
-- 2. Add item category reference to storage_locations
--    (optional) restricts basket to certain product categories.
-- ============================================================
ALTER TABLE public.storage_locations
  ADD COLUMN IF NOT EXISTS "item_category_id" uuid;

ALTER TABLE public.storage_locations
  ADD CONSTRAINT "storage_locations_item_category_fk"
    FOREIGN KEY ("item_category_id") REFERENCES public.product_categories("id") ON DELETE SET NULL;

-- ============================================================
-- 3. QC Checklist template for Cold Storage
--    Each item is a yes/no/passthrough check during receiving.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qc_cs_checklist_templates (
    id            uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL,
    checklist_item text NOT NULL,
    description    text,
    is_required    boolean DEFAULT true,
    check_type     text DEFAULT 'PASS_FAIL' NOT NULL,
    -- PASS_FAIL = pass/fail, NUMERIC = numeric input, TEXT = free text
    sort_order     integer DEFAULT 0,
    active         boolean DEFAULT true,
    created_by     uuid,
    created_at     timestamp with time zone DEFAULT now(),
    updated_at     timestamp with time zone DEFAULT now(),
    CONSTRAINT qc_cs_checklist_type CHECK (check_type IN ('PASS_FAIL','NUMERIC','TEXT','PHOTO'))
);

-- Seed default QC items for cold storage
INSERT INTO public.qc_cs_checklist_templates
  (organization_id, checklist_item, description, is_required, check_type, sort_order, active, created_by)
SELECT
  o.id,
  v.item,
  v.item_desc,
  v.required,
  v.check_type,
  v.sort_order,
  true,
  NULL
FROM public.organizations o
CROSS JOIN (VALUES
  ('Warna produk normal',          'Warna daging/ikan/produk tidak berubah atau membiru',           true,  'PASS_FAIL', 1),
  ('Tidak berbau busuk',            'Tidak ada bau busuk, asam, atau bau tidak wajar',                true,  'PASS_FAIL', 2),
  ('Kemasan utuh',                  'Kemasan tidak sobek, kembung, atau rusak',                       true,  'PASS_FAIL', 3),
  ('Suhu saat masuk < 5C',          'Suhu produk saat masuk cold storage harus di bawah 5 derajat', true,  'NUMERIC',   4),
  ('Tidak ada tanda kerusakan',      'Tidak ada tanda kerusakan fisik, lendir berlebih, atau kontaminasi', false, 'PASS_FAIL', 5),
  ('Berat sesuai nota',             'Berat yang ditimbang sesuai dengan berat di dokumen terima',      true,  'PASS_FAIL', 6),
  ('Label/etiket terbaca',          'Label produk jelas, tidak rusak, dan sesuai standar',           false, 'PASS_FAIL', 7),
  ('Foto produk masuk (wajib)',      'Dokumentasi foto produk saat masuk sebagai evidence',         true,  'PHOTO',     8)
) AS v(item, item_desc, required, check_type, sort_order)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. QC result per receiving (cold storage)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.qc_cs_receiving_results (
    id                    uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
    receiving_id          uuid  NOT NULL,
    checklist_template_id uuid  NOT NULL,
    result_pass           boolean,
    result_value          text,
    photo_url             text,
    notes                 text,
    performed_by          uuid,
    created_at            timestamp with time zone DEFAULT now(),
    CONSTRAINT qc_cs_receiving_results_template_fk
      FOREIGN KEY (checklist_template_id) REFERENCES public.qc_cs_checklist_templates(id),
    CONSTRAINT qc_cs_receiving_results_receiving_fk
      FOREIGN KEY (receiving_id) REFERENCES public.inventory_movements(id) ON DELETE CASCADE
);

-- ============================================================
-- 5. Update storage_location RLS for new columns
-- ============================================================
DROP POLICY IF EXISTS "storage_locations_cs_basket_read" ON public.storage_locations;
CREATE POLICY "storage_locations_cs_basket_read"
  ON public.storage_locations FOR SELECT
  USING (public.is_org_member("organization_id"));

DROP POLICY IF EXISTS "storage_locations_cs_basket_insert" ON public.storage_locations;
CREATE POLICY "storage_locations_cs_basket_insert"
  ON public.storage_locations FOR INSERT
  WITH CHECK (public.has_org_permission("organization_id", 'rental.manage'));

DROP POLICY IF EXISTS "storage_locations_cs_basket_update" ON public.storage_locations;
CREATE POLICY "storage_locations_cs_basket_update"
  ON public.storage_locations FOR UPDATE
  USING (public.has_org_permission("organization_id", 'rental.manage'))
  WITH CHECK (public.has_org_permission("organization_id", 'rental.manage'));
