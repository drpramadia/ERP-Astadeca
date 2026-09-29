-- Migration: 044_rental_inquiry.sql
-- Table for tracking pre-contract customer inquiries
-- Date: 2026-09-29

CREATE TABLE IF NOT EXISTS public.rental_inquiries (
    id                        uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id           uuid  NOT NULL,
    inquiry_number            text  NOT NULL,
    customer_name             text  NOT NULL,
    customer_phone            text,
    customer_email            text,
    product_type              text,
    estimated_quantity_kg    numeric(14,3),
    estimated_duration_days   integer,
    notes                     text,
    status                   text DEFAULT 'BARU' NOT NULL,
    created_by                uuid,
    created_at                timestamp with time zone DEFAULT now(),
    updated_at                timestamp with time zone DEFAULT now(),
    CONSTRAINT rental_inquiries_status_check
        CHECK (status = ANY (ARRAY['BARU'::text,'DIFOLLOWUP'::text,'DEAL'::text,'GAGAL'::text,'CLOSED'::text]))
);

-- RLS
ALTER TABLE public.rental_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rental_inquiries_all_read" ON public.rental_inquiries;
CREATE POLICY "rental_inquiries_all_read"
    ON public.rental_inquiries FOR SELECT
    USING (public.is_org_member("organization_id"));

DROP POLICY IF EXISTS "rental_inquiries_insert" ON public.rental_inquiries;
CREATE POLICY "rental_inquiries_insert"
    ON public.rental_inquiries FOR INSERT
    WITH CHECK (public.is_org_member("organization_id"));

DROP POLICY IF EXISTS "rental_inquiries_update" ON public.rental_inquiries;
CREATE POLICY "rental_inquiries_update"
    ON public.rental_inquiries FOR UPDATE
    USING (public.has_org_permission("organization_id", 'rental.manage'))
    WITH CHECK (public.has_org_permission("organization_id", 'rental.manage'));


-- Number generator for inquiry
CREATE OR REPLACE FUNCTION public.generate_inquiry_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_seq    bigint;
    v_prefix text;
    v_year  text;
BEGIN
    SELECT to_char(now(), 'YY') INTO v_year;
    SELECT substring(COALESCE(current_setting('app.tenant_prefix', true), ''), 1, 4) INTO v_prefix;
    IF v_prefix = '' THEN v_prefix := 'INQ'; END IF;

    INSERT INTO public.number_sequences (organization_id, sequence_name, last_value)
    VALUES (p_org_id, 'inquiry', 1)
    ON CONFLICT (organization_id, sequence_name) DO UPDATE SET last_value = number_sequences.last_value + 1
    RETURNING last_value INTO v_seq;

    RETURN concat(v_prefix, '-', v_year, '-', lpad(v_seq::text, 5, '0'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_inquiry_number(uuid) TO authenticated;
