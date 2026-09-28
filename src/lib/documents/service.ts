import { createClient } from '@/lib/supabase/server';
import type { Document, DocumentLine, DocumentType, DocumentStatus } from './types';

export async function getDocuments(params: {
  organizationId: string;
  documentType?: DocumentType;
  status?: DocumentStatus;
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}) {
  const supabase = await createClient();
  const { organizationId, documentType, status, search, page = 1, limit = 20 } = params;
  
  let query = supabase
    .from('documents')
    .select(`
      *,
      customer:customers(name, code),
      supplier:suppliers(name, code),
      created_by_profile:profiles!documents_created_by_fkey(full_name)
    `, { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('document_date', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (documentType) {
    query = query.eq('document_type', documentType);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (search) {
    query = query.or(`document_number.ilike.%${search}%,title.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  
  if (error) throw error;
  
  return {
    documents: data as Document[],
    total: count || 0,
    page,
    limit,
  };
}

export async function getDocument(id: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('documents')
    .select(`
      *,
      customer:customers(*),
      supplier:suppliers(*),
      created_by_profile:profiles!documents_created_by_fkey(full_name),
      lines:document_lines(*),
      attachments:document_attachments(*)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createDocument(data: {
  organizationId: string;
  documentType: DocumentType;
  title: string;
  subtitle?: string;
  sourceType?: string;
  sourceId?: string;
  customerId?: string;
  supplierId?: string;
  referenceNumber?: string;
  referenceType?: string;
  notes?: string;
  lines?: Omit<DocumentLine, 'id' | 'document_id' | 'line_number'>[];
  createdBy: string;
}) {
  const supabase = await createClient();
  
  // Generate document number
  const { data: numberData } = await supabase.rpc('generate_document_number', {
    p_org_id: data.organizationId,
    p_doc_type: data.documentType,
  });
  
  const documentNumber = numberData as string;
  
  // Create document
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      organization_id: data.organizationId,
      document_type: data.documentType,
      document_number: documentNumber,
      title: data.title,
      subtitle: data.subtitle,
      source_type: data.sourceType,
      source_id: data.sourceId,
      customer_id: data.customerId,
      supplier_id: data.supplierId,
      reference_number: data.referenceNumber,
      reference_type: data.referenceType,
      notes: data.notes,
      status: 'DRAFT',
      created_by: data.createdBy,
    })
    .select()
    .single();

  if (docError) throw docError;

  // Create document lines if provided
  if (data.lines && data.lines.length > 0) {
    const linesToInsert = data.lines.map((line, index) => ({
      document_id: doc.id,
      line_number: index + 1,
      ...line,
    }));

    const { error: linesError } = await supabase
      .from('document_lines')
      .insert(linesToInsert);

    if (linesError) throw linesError;
  }

  return doc;
}

export async function updateDocumentStatus(
  id: string,
  status: DocumentStatus,
  issuedBy?: string
) {
  const supabase = await createClient();
  
  const updateData: Record<string, unknown> = { status };
  
  if (status === 'ISSUED' && issuedBy) {
    updateData.issued_at = new Date().toISOString();
    updateData.issued_by = issuedBy;
  }

  const { data, error } = await supabase
    .from('documents')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function verifyDocument(token: string) {
  const supabase = await createClient();
  
  const { data: doc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('verification_token', token)
    .single();

  if (error || !doc) {
    return { valid: false, document: null };
  }

  // Log verification
  await supabase
    .from('document_verification_log')
    .insert({
      document_id: doc.id,
      verification_token: token,
      result: 'VERIFIED',
    });

  return { valid: true, document: doc };
}

export async function getDocumentBySource(sourceType: string, sourceId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('source_type', sourceType)
    .eq('source_id', sourceId)
    .single();

  if (error) return null;
  return data;
}

export async function getDocumentStats(organizationId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('documents')
    .select('document_type, status')
    .eq('organization_id', organizationId);

  if (error) throw error;

  const stats: Record<string, Record<string, number>> = {};
  
  for (const doc of data || []) {
    if (!stats[doc.document_type]) {
      stats[doc.document_type] = {};
    }
    stats[doc.document_type][doc.status] = (stats[doc.document_type][doc.status] || 0) + 1;
  }

  return stats;
}
