-- Migration: 010_documents.sql
-- Document Engine for ASTADECA BASWARA PERSADA
-- Date: 2026-09-26

-- ============================================
-- DOCUMENT NUMBERING SEQUENCE (thread-safe)
-- ============================================
CREATE SEQUENCE IF NOT EXISTS public.document_number_seq;

-- ============================================
-- DOCUMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  document_type VARCHAR(50) NOT NULL,
  document_number VARCHAR(50) NOT NULL,
  document_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  source_type VARCHAR(50),
  source_id UUID,
  title TEXT NOT NULL,
  subtitle TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  reference_number VARCHAR(100),
  reference_type VARCHAR(50),
  file_path TEXT,
  file_url TEXT,
  verification_token UUID DEFAULT gen_random_uuid(),
  metadata JSONB DEFAULT '{}',
  notes TEXT,
  issued_at TIMESTAMPTZ,
  issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_org_type ON public.documents(organization_id, document_type);
CREATE INDEX IF NOT EXISTS idx_documents_date ON public.documents(organization_id, document_date);
CREATE INDEX IF NOT EXISTS idx_documents_source ON public.documents(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_customer ON public.documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_documents_supplier ON public.documents(supplier_id);
CREATE INDEX IF NOT EXISTS idx_documents_token ON public.documents(verification_token);

-- ============================================
-- DOCUMENT LINES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.document_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
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

-- ============================================
-- DOCUMENT ATTACHMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.document_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(50),
  file_size INTEGER,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_attach_doc ON public.document_attachments(document_id);

-- ============================================
-- DOCUMENT VERIFICATION LOG
-- ============================================
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

-- ============================================
-- DOCUMENT NUMBER GENERATOR FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_document_number(p_org_id UUID, p_doc_type VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_prefix VARCHAR(10);
  v_year VARCHAR(4);
  v_seq INTEGER;
  v_number VARCHAR(50);
BEGIN
  v_year := to_char(CURRENT_DATE, 'YYYY');
  SELECT nextval('public.document_number_seq') INTO v_seq;
  
  v_prefix := CASE p_doc_type
    WHEN 'QUOTATION' THEN 'QUO'
    WHEN 'PURCHASE_REQUEST' THEN 'PR'
    WHEN 'RFQ' THEN 'RFQ'
    WHEN 'PURCHASE_ORDER' THEN 'PO'
    WHEN 'GOODS_RECEIPT' THEN 'GR'
    WHEN 'QC_REPORT' THEN 'QC'
    WHEN 'QUARANTINE_REPORT' THEN 'QR'
    WHEN 'QUARANTINE_RELEASE' THEN 'QRL'
    WHEN 'STOCK_CARD' THEN 'SC'
    WHEN 'STOCK_MOVEMENT' THEN 'SM'
    WHEN 'TRANSFER_NOTE' THEN 'TR'
    WHEN 'STOCK_OPNAME' THEN 'SO'
    WHEN 'STOCK_ADJUSTMENT' THEN 'ADJ'
    WHEN 'SALES_QUOTATION' THEN 'SQ'
    WHEN 'SALES_ORDER' THEN 'SO'
    WHEN 'PICKING_LIST' THEN 'PL'
    WHEN 'DELIVERY_ORDER' THEN 'DO'
    WHEN 'SURAT_JALAN' THEN 'SJ'
    WHEN 'POD' THEN 'POD'
    WHEN 'CUSTOMER_RETURN' THEN 'CR'
    WHEN 'SUPPLIER_RETURN' THEN 'SR'
    WHEN 'RETURN_RECEIPT' THEN 'RR'
    WHEN 'RENTAL_QUOTATION' THEN 'RQT'
    WHEN 'RENTAL_CONTRACT' THEN 'CTR'
    WHEN 'RENTAL_RECEIVING' THEN 'RRN'
    WHEN 'RENTAL_STOCK' THEN 'RST'
    WHEN 'RENTAL_RELEASE' THEN 'RLS'
    WHEN 'RENTAL_BILLING' THEN 'RBS'
    WHEN 'RENTAL_INVOICE' THEN 'RINV'
    WHEN 'SALES_INVOICE' THEN 'INV'
    WHEN 'CREDIT_NOTE' THEN 'CN'
    WHEN 'DEBIT_NOTE' THEN 'DN'
    WHEN 'PAYMENT_RECEIPT' THEN 'RC'
    WHEN 'PAYMENT_VOUCHER' THEN 'PV'
    WHEN 'APPROVAL_SHEET' THEN 'APS'
    ELSE 'DOC'
  END;
  
  v_number := v_prefix || '-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGER: updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.documents IS 'Document registry for ASTADECA BASWARA PERSADA';
