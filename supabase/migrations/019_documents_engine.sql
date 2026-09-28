-- Migration: 019_documents_engine.sql
-- Document Engine: tables, functions, RLS
-- Applied directly via SQL Editor
-- Date: 2026-09-26

-- DOCUMENT ENGINE SETUP
-- Run this in Supabase SQL Editor

-- Document Engine Tables for ASTADECA BASWARA PERSADA
-- Execute this directly on Supabase Dashboard SQL Editor

-- Document number sequence
CREATE SEQUENCE IF NOT EXISTS public.document_number_seq;

-- Documents table
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  document_type VARCHAR(50) NOT NULL,
  document_number VARCHAR(50) NOT NULL UNIQUE,
  document_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  source_type VARCHAR(50),
  source_id UUID,
  title TEXT NOT NULL,
  subtitle TEXT,
  customer_id UUID REFERENCES public.customers(id),
  supplier_id UUID REFERENCES public.suppliers(id),
  reference_number VARCHAR(100),
  reference_type VARCHAR(50),
  file_path TEXT,
  file_url TEXT,
  verification_token UUID DEFAULT gen_random_uuid(),
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  issued_at TIMESTAMPTZ,
  issued_by UUID REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_org_type ON public.documents(organization_id, document_type);
CREATE INDEX IF NOT EXISTS idx_docs_date ON public.documents(organization_id, document_date);
CREATE INDEX IF NOT EXISTS idx_docs_source ON public.documents(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_docs_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_docs_token ON public.documents(verification_token);

-- Document lines
CREATE TABLE IF NOT EXISTS public.document_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  product_id UUID REFERENCES public.products(id),
  description TEXT,
  sku VARCHAR(50),
  batch_number VARCHAR(50),
  quantity DECIMAL(15,3),
  unit_code VARCHAR(20),
  unit_price DECIMAL(15,2),
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  tax_percentage DECIMAL(5,2) DEFAULT 0,
  subtotal DECIMAL(15,2),
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_lines_doc ON public.document_lines(document_id);

-- Document attachments
CREATE TABLE IF NOT EXISTS public.document_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(50),
  file_size INTEGER,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_attach_doc ON public.document_attachments(document_id);

-- Document verification log
CREATE TABLE IF NOT EXISTS public.document_verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  verification_token UUID NOT NULL,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  result VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_verify_token ON public.document_verification_log(verification_token);

-- RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_verification_log ENABLE ROW LEVEL SECURITY;

-- Policies (simplified - allow org members)
CREATE POLICY doc_select ON public.documents FOR SELECT USING (public.is_org_member(organization_id));
CREATE POLICY doc_insert ON public.documents FOR INSERT WITH CHECK (public.has_org_permission(organization_id, 'documents.create'));
CREATE POLICY doc_update ON public.documents FOR UPDATE USING (public.has_org_permission(organization_id, 'documents.manage'));
CREATE POLICY doc_delete ON public.documents FOR DELETE USING (public.has_org_permission(organization_id, 'documents.manage'));

CREATE POLICY doc_lines_select ON public.document_lines FOR SELECT USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)));
CREATE POLICY doc_lines_all ON public.document_lines FOR ALL USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.has_org_permission(d.organization_id, 'documents.manage')));

CREATE POLICY doc_attach_select ON public.document_attachments FOR SELECT USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.is_org_member(d.organization_id)));
CREATE POLICY doc_attach_all ON public.document_attachments FOR ALL USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.has_org_permission(d.organization_id, 'documents.manage')));

CREATE POLICY doc_verify_select ON public.document_verification_log FOR SELECT USING (true);
CREATE POLICY doc_verify_insert ON public.document_verification_log FOR INSERT WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at() RETURNS TRIGGER AS $BODY$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $BODY$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER tr_docs_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- Document Engine Functions

-- Document number generator
CREATE OR REPLACE FUNCTION public.generate_document_number(p_org_id UUID, p_doc_type VARCHAR)
RETURNS VARCHAR AS $BODY$
DECLARE
  v_prefix VARCHAR(10);
  v_year VARCHAR(4);
  v_seq INTEGER;
  v_number VARCHAR(50);
BEGIN
  v_year := to_char(CURRENT_DATE, 'YYYY');
  SELECT nextval('public.document_number_seq') INTO v_seq;
  
  v_prefix := CASE p_doc_type
    WHEN 'QUOTATION' THEN 'QUO' WHEN 'PURCHASE_REQUEST' THEN 'PR' WHEN 'RFQ' THEN 'RFQ'
    WHEN 'PURCHASE_ORDER' THEN 'PO' WHEN 'GOODS_RECEIPT' THEN 'GR' WHEN 'QC_REPORT' THEN 'QC'
    WHEN 'QUARANTINE_REPORT' THEN 'QR' WHEN 'QUARANTINE_RELEASE' THEN 'QRL'
    WHEN 'STOCK_CARD' THEN 'SC' WHEN 'STOCK_MOVEMENT' THEN 'SM' WHEN 'TRANSFER_NOTE' THEN 'TR'
    WHEN 'STOCK_OPNAME' THEN 'SO' WHEN 'STOCK_ADJUSTMENT' THEN 'ADJ'
    WHEN 'SALES_QUOTATION' THEN 'SQ' WHEN 'SALES_ORDER' THEN 'SO' WHEN 'PICKING_LIST' THEN 'PL'
    WHEN 'DELIVERY_ORDER' THEN 'DO' WHEN 'SURAT_JALAN' THEN 'SJ' WHEN 'POD' THEN 'POD'
    WHEN 'CUSTOMER_RETURN' THEN 'CR' WHEN 'SUPPLIER_RETURN' THEN 'SR' WHEN 'RETURN_RECEIPT' THEN 'RR'
    WHEN 'RENTAL_QUOTATION' THEN 'RQT' WHEN 'RENTAL_CONTRACT' THEN 'CTR' WHEN 'RENTAL_RECEIVING' THEN 'RRN'
    WHEN 'RENTAL_STOCK' THEN 'RST' WHEN 'RENTAL_RELEASE' THEN 'RLS' WHEN 'RENTAL_BILLING' THEN 'RBS'
    WHEN 'RENTAL_INVOICE' THEN 'RINV' WHEN 'SALES_INVOICE' THEN 'INV' WHEN 'CREDIT_NOTE' THEN 'CN'
    WHEN 'DEBIT_NOTE' THEN 'DN' WHEN 'PAYMENT_RECEIPT' THEN 'RC' WHEN 'PAYMENT_VOUCHER' THEN 'PV'
    WHEN 'APPROVAL_SHEET' THEN 'APS' ELSE 'DOC' END;
  
  v_number := v_prefix || '-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
  RETURN v_number;
END;
$BODY$ LANGUAGE plpgsql;

-- Create document from transaction
CREATE OR REPLACE FUNCTION public.create_document_from_transaction(
  p_organization_id UUID, p_document_type VARCHAR, p_title TEXT,
  p_source_type VARCHAR DEFAULT NULL, p_source_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL, p_supplier_id UUID DEFAULT NULL,
  p_reference_number VARCHAR DEFAULT NULL, p_reference_type VARCHAR DEFAULT NULL,
  p_notes TEXT DEFAULT NULL, p_created_by UUID DEFAULT NULL,
  p_document_lines JSONB DEFAULT NULL
)
RETURNS TABLE(document_id UUID, document_number VARCHAR, success BOOLEAN, message TEXT) AS $BODY$
DECLARE
  v_doc_id UUID;
  v_doc_number VARCHAR;
  v_line JSONB;
  v_line_num INTEGER;
BEGIN
  IF NOT public.has_org_permission(p_organization_id, 'documents.create') THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'Unauthorized'::TEXT;
    RETURN;
  END IF;

  -- Check if already exists
  IF p_source_type IS NOT NULL AND p_source_id IS NOT NULL AND
     EXISTS (SELECT 1 FROM public.documents WHERE source_type = p_source_type AND source_id = p_source_id) THEN
    SELECT id, document_number INTO v_doc_id, v_doc_number
    FROM public.documents WHERE source_type = p_source_type AND source_id = p_source_id;
    UPDATE public.documents SET title = p_title, customer_id = COALESCE(p_customer_id, customer_id),
      supplier_id = COALESCE(p_supplier_id, supplier_id), reference_number = COALESCE(p_reference_number, reference_number),
      notes = COALESCE(p_notes, notes), updated_at = NOW() WHERE id = v_doc_id;
    DELETE FROM public.document_lines WHERE document_id = v_doc_id;
    IF p_document_lines IS NOT NULL THEN
      v_line_num := 1;
      FOR v_line IN SELECT * FROM jsonb_array_elements(p_document_lines) LOOP
        INSERT INTO public.document_lines (document_id, line_number, description, sku, batch_number, quantity, unit_code, unit_price, subtotal)
        VALUES (v_doc_id, v_line_num, v_line->>'description', v_line->>'sku', v_line->>'batch_number',
          (v_line->>'quantity')::DECIMAL, v_line->>'unit_code', (v_line->>'unit_price')::DECIMAL, (v_line->>'subtotal')::DECIMAL);
        v_line_num := v_line_num + 1;
      END LOOP;
    END IF;
    RETURN QUERY SELECT v_doc_id, v_doc_number, true, 'Updated'::TEXT;
    RETURN;
  END IF;

  SELECT public.generate_document_number(p_organization_id, p_document_type) INTO v_doc_number;

  INSERT INTO public.documents (organization_id, document_type, document_number, title, source_type, source_id,
    customer_id, supplier_id, reference_number, reference_type, notes, created_by, status)
  VALUES (p_organization_id, p_document_type, v_doc_number, p_title, p_source_type, p_source_id,
    p_customer_id, p_supplier_id, p_reference_number, p_reference_type, p_notes, p_created_by, 'DRAFT')
  RETURNING id INTO v_doc_id;

  IF p_document_lines IS NOT NULL THEN
    v_line_num := 1;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_document_lines) LOOP
      INSERT INTO public.document_lines (document_id, line_number, description, sku, batch_number, quantity, unit_code, unit_price, subtotal)
      VALUES (v_doc_id, v_line_num, v_line->>'description', v_line->>'sku', v_line->>'batch_number',
        (v_line->>'quantity')::DECIMAL, v_line->>'unit_code', (v_line->>'unit_price')::DECIMAL, (v_line->>'subtotal')::DECIMAL);
      v_line_num := v_line_num + 1;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_doc_id, v_doc_number, true, 'Created'::TEXT;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public;

-- Issue document
CREATE OR REPLACE FUNCTION public.issue_document(p_document_id UUID, p_issued_by UUID DEFAULT NULL)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $BODY$
DECLARE v_doc RECORD;
BEGIN
  SELECT * INTO v_doc FROM public.documents WHERE id = p_document_id;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Not found'::TEXT; RETURN; END IF;
  IF v_doc.status NOT IN ('DRAFT', 'PENDING') THEN
    RETURN QUERY SELECT false, 'Cannot issue: ' || v_doc.status; RETURN; END IF;
  UPDATE public.documents SET status = 'ISSUED', issued_at = NOW(), issued_by = p_issued_by, updated_at = NOW()
  WHERE id = p_document_id;
  RETURN QUERY SELECT true, 'Issued'::TEXT;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public;

-- Verify document token
CREATE OR REPLACE FUNCTION public.verify_document_token(p_token UUID)
RETURNS TABLE(valid BOOLEAN, document_number VARCHAR, document_type VARCHAR, status VARCHAR, message TEXT) AS $BODY$
DECLARE v_doc RECORD;
BEGIN
  SELECT d.document_number, d.document_type, d.status, o.name INTO v_doc
  FROM public.documents d JOIN public.organizations o ON o.id = d.organization_id
  WHERE d.verification_token = p_token;
  IF NOT FOUND THEN RETURN QUERY SELECT false, NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR, 'Not found'::TEXT; RETURN; END IF;
  INSERT INTO public.document_verification_log (document_id, verification_token, result)
  SELECT id, p_token, 'VERIFIED' FROM public.documents WHERE verification_token = p_token;
  RETURN QUERY SELECT true, v_doc.document_number, v_doc.document_type, v_doc.status, 'Verified'::TEXT;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public;
