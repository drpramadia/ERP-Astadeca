-- Migration: 011_documents_rpc.sql
-- Document Engine RPC Functions and RLS Policies
-- Date: 2026-09-26

-- ============================================
-- ENABLE RLS ON DOCUMENT TABLES
-- ============================================
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_verification_log ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES FOR DOCUMENTS
-- ============================================

-- Documents: anyone in org can see
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (public.is_org_member(organization_id));

-- Only managers can create/update documents
CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (public.has_org_permission(organization_id, 'documents.create'::text));

CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (public.has_org_permission(organization_id, 'documents.manage'::text));

-- Documents cannot be deleted (audit trail)
CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (public.has_org_permission(organization_id, 'documents.manage'::text));

-- Document lines follow document permissions
CREATE POLICY "doc_lines_select" ON public.document_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_lines.document_id AND public.is_org_member(d.organization_id))
  );

CREATE POLICY "doc_lines_insert" ON public.document_lines
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_lines.document_id AND public.has_org_permission(d.organization_id, 'documents.create'::text))
  );

CREATE POLICY "doc_lines_update" ON public.document_lines
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_lines.document_id AND public.has_org_permission(d.organization_id, 'documents.manage'::text))
  );

CREATE POLICY "doc_lines_delete" ON public.document_lines
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_lines.document_id AND public.has_org_permission(d.organization_id, 'documents.manage'::text))
  );

-- Attachments
CREATE POLICY "doc_attach_select" ON public.document_attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_attachments.document_id AND public.is_org_member(d.organization_id))
  );

CREATE POLICY "doc_attach_insert" ON public.document_attachments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_attachments.document_id AND public.has_org_permission(d.organization_id, 'documents.create'::text))
  );

CREATE POLICY "doc_attach_delete" ON public.document_attachments
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_attachments.document_id AND public.has_org_permission(d.organization_id, 'documents.manage'::text))
  );

-- Verification log is public for verification token lookup
CREATE POLICY "doc_verify_select" ON public.document_verification_log
  FOR SELECT USING (true);

CREATE POLICY "doc_verify_insert" ON public.document_verification_log
  FOR INSERT WITH CHECK (true);

-- ============================================
-- RPC: CREATE DOCUMENT FROM TRANSACTION
-- ============================================
CREATE OR REPLACE FUNCTION public.create_document_from_transaction(
  p_organization_id UUID,
  p_document_type VARCHAR,
  p_title TEXT,
  p_source_type VARCHAR,
  p_source_id UUID,
  p_customer_id UUID DEFAULT NULL,
  p_supplier_id UUID DEFAULT NULL,
  p_reference_number VARCHAR DEFAULT NULL,
  p_reference_type VARCHAR DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID,
  p_document_lines JSONB DEFAULT NULL
)
RETURNS TABLE (
  document_id UUID,
  document_number VARCHAR,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_doc_id UUID;
  v_doc_number VARCHAR;
  v_line JSONB;
  v_line_num INTEGER;
BEGIN
  -- Check permission
  IF NOT public.has_org_permission(p_organization_id, 'documents.create'::text) THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR, false, 'Unauthorized'::TEXT;
    RETURN;
  END IF;

  -- Check if document already exists for this source
  IF EXISTS (SELECT 1 FROM public.documents WHERE source_type = p_source_type AND source_id = p_source_id) THEN
    -- Update existing document
    SELECT id, document_number INTO v_doc_id, v_doc_number
    FROM public.documents WHERE source_type = p_source_type AND source_id = p_source_id;
    
    UPDATE public.documents SET
      title = p_title,
      customer_id = COALESCE(p_customer_id, customer_id),
      supplier_id = COALESCE(p_supplier_id, supplier_id),
      reference_number = COALESCE(p_reference_number, reference_number),
      reference_type = COALESCE(p_reference_type, reference_type),
      notes = COALESCE(p_notes, notes),
      updated_at = NOW()
    WHERE id = v_doc_id;
    
    -- Update lines
    DELETE FROM public.document_lines WHERE document_id = v_doc_id;
    
    IF p_document_lines IS NOT NULL THEN
      v_line_num := 1;
      FOR v_line IN SELECT * FROM jsonb_array_elements(p_document_lines) LOOP
        INSERT INTO public.document_lines (document_id, line_number, description, sku, batch_number, quantity, unit_code, unit_price, discount_percentage, subtotal, notes)
        VALUES (
          v_doc_id, v_line_num,
          v_line->>'description',
          v_line->>'sku',
          v_line->>'batch_number',
          (v_line->>'quantity')::DECIMAL,
          v_line->>'unit_code',
          (v_line->>'unit_price')::DECIMAL,
          COALESCE((v_line->>'discount_percentage')::DECIMAL, 0),
          (v_line->>'subtotal')::DECIMAL,
          v_line->>'notes'
        );
        v_line_num := v_line_num + 1;
      END LOOP;
    END IF;
    
    RETURN QUERY SELECT v_doc_id, v_doc_number, true, 'Document updated'::TEXT;
    RETURN;
  END IF;

  -- Generate document number
  SELECT public.generate_document_number(p_organization_id, p_document_type) INTO v_doc_number;

  -- Create document
  INSERT INTO public.documents (
    organization_id, document_type, document_number, title, source_type, source_id,
    customer_id, supplier_id, reference_number, reference_type, notes, created_by, status
  ) VALUES (
    p_organization_id, p_document_type, v_doc_number, p_title, p_source_type, p_source_id,
    p_customer_id, p_supplier_id, p_reference_number, p_reference_type, p_notes, p_created_by, 'DRAFT'
  ) RETURNING id INTO v_doc_id;

  -- Create document lines
  IF p_document_lines IS NOT NULL THEN
    v_line_num := 1;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_document_lines) LOOP
      INSERT INTO public.document_lines (document_id, line_number, description, sku, batch_number, quantity, unit_code, unit_price, discount_percentage, subtotal, notes)
      VALUES (
        v_doc_id, v_line_num,
        v_line->>'description',
        v_line->>'sku',
        v_line->>'batch_number',
        (v_line->>'quantity')::DECIMAL,
        v_line->>'unit_code',
        (v_line->>'unit_price')::DECIMAL,
        COALESCE((v_line->>'discount_percentage')::DECIMAL, 0),
        (v_line->>'subtotal')::DECIMAL,
        v_line->>'notes'
      );
      v_line_num := v_line_num + 1;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_doc_id, v_doc_number, true, 'Document created'::TEXT;
END;
$$;

-- ============================================
-- RPC: ISSUE DOCUMENT
-- ============================================
CREATE OR REPLACE FUNCTION public.issue_document(
  p_document_id UUID,
  p_issued_by UUID
)
RETURNS TABLE (success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_doc RECORD;
BEGIN
  -- Get document
  SELECT * INTO v_doc FROM public.documents WHERE id = p_document_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Document not found'::TEXT;
    RETURN;
  END IF;

  -- Check permission
  IF NOT public.has_org_permission(v_doc.organization_id, 'documents.manage'::text) THEN
    RETURN QUERY SELECT false, 'Unauthorized'::TEXT;
    RETURN;
  END IF;

  -- Only DRAFT or PENDING can be issued
  IF v_doc.status NOT IN ('DRAFT', 'PENDING') THEN
    RETURN QUERY SELECT false, 'Document cannot be issued in current status: ' || v_doc.status::TEXT;
    RETURN;
  END IF;

  -- Issue the document
  UPDATE public.documents SET
    status = 'ISSUED',
    issued_at = NOW(),
    issued_by = p_issued_by,
    updated_at = NOW()
  WHERE id = p_document_id;

  -- Audit log
  INSERT INTO public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_data)
  VALUES (v_doc.organization_id, p_issued_by, 'DOCUMENT_ISSUED', 'documents', p_document_id, jsonb_build_object('document_number', v_doc.document_number, 'issued_at', NOW()));

  RETURN QUERY SELECT true, 'Document issued successfully'::TEXT;
END;
$$;

-- ============================================
-- RPC: CANCEL DOCUMENT
-- ============================================
CREATE OR REPLACE FUNCTION public.cancel_document(
  p_document_id UUID,
  p_cancelled_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_doc RECORD;
BEGIN
  SELECT * INTO v_doc FROM public.documents WHERE id = p_document_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Document not found'::TEXT;
    RETURN;
  END IF;

  IF NOT public.has_org_permission(v_doc.organization_id, 'documents.manage'::text) THEN
    RETURN QUERY SELECT false, 'Unauthorized'::TEXT;
    RETURN;
  END IF;

  IF v_doc.status IN ('CANCELLED', 'VOID') THEN
    RETURN QUERY SELECT false, 'Document already cancelled'::TEXT;
    RETURN;
  END IF;

  UPDATE public.documents SET
    status = 'CANCELLED',
    notes = COALESCE(notes || E'\nCancellation reason: ', '') || COALESCE(p_reason, 'No reason provided'),
    updated_at = NOW()
  WHERE id = p_document_id;

  INSERT INTO public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, new_data)
  VALUES (v_doc.organization_id, p_cancelled_by, 'DOCUMENT_CANCELLED', 'documents', p_document_id, jsonb_build_object('document_number', v_doc.document_number, 'reason', p_reason));

  RETURN QUERY SELECT true, 'Document cancelled'::TEXT;
END;
$$;

-- ============================================
-- RPC: VERIFY DOCUMENT
-- ============================================
CREATE OR REPLACE FUNCTION public.verify_document_token(p_token UUID)
RETURNS TABLE (
  valid BOOLEAN,
  document_number VARCHAR,
  document_type VARCHAR,
  document_date DATE,
  status VARCHAR,
  organization_name VARCHAR,
  issued_at TIMESTAMPTZ,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_doc RECORD;
BEGIN
  SELECT d.document_number, d.document_type, d.document_date, d.status, d.issued_at, d.verification_token,
         o.name as org_name
  INTO v_doc
  FROM public.documents d
  JOIN public.organizations o ON o.id = d.organization_id
  WHERE d.verification_token = p_token;

  IF NOT FOUND OR v_doc.verification_token != p_token THEN
    RETURN QUERY SELECT false, NULL::VARCHAR, NULL::VARCHAR, NULL::DATE, NULL::VARCHAR, NULL::VARCHAR, NULL::TIMESTAMPTZ, 'Document not found or token invalid'::TEXT;
    RETURN;
  END IF;

  -- Log verification
  INSERT INTO public.document_verification_log (document_id, verification_token, result)
  SELECT id, p_token, 'VERIFIED'
  FROM public.documents WHERE verification_token = p_token;

  RETURN QUERY SELECT true, v_doc.document_number, v_doc.document_type, v_doc.document_date, v_doc.status, v_doc.org_name, v_doc.issued_at, 'Document verified successfully'::TEXT;
END;
$$;

-- ============================================
-- FUNCTION: GET DOCUMENT STATS
-- ============================================
CREATE OR REPLACE FUNCTION public.get_document_stats(p_organization_id UUID)
RETURNS TABLE (
  document_type VARCHAR,
  status VARCHAR,
  count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT d.document_type, d.status, COUNT(*)::BIGINT
  FROM public.documents d
  WHERE d.organization_id = p_organization_id
  GROUP BY d.document_type, d.status
  ORDER BY d.document_type, d.status;
END;
$$;
