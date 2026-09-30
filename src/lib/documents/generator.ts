import { createClient } from '@/lib/supabase/server';
import type { DocumentType, DocumentLine } from './types';

interface CreateDocumentFromPOParams {
  organizationId: string;
  poId: string;
  createdBy: string;
}

interface CreateDocumentFromDOParams {
  organizationId: string;
  doId: string;
  createdBy: string;
}

interface CreateDocumentFromSOParams {
  organizationId: string;
  soId: string;
  createdBy: string;
}

interface CreateDocumentFromReceivingParams {
  organizationId: string;
  receivingId: string;
  createdBy: string;
}

// ============================================
// PURCHASE ORDER DOCUMENT
// ============================================
export async function createDocumentFromPurchaseOrder(params: CreateDocumentFromPOParams) {
  const supabase = await createClient();
  const { organizationId, poId, createdBy } = params;

  // Get PO data
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      supplier:suppliers(*),
      items:purchase_order_items(
        *,
        product:products(*),
        unit:units(*)
      )
    `)
    .eq('id', poId)
    .single();

  if (poError || !po) throw new Error('Purchase Order tidak ditemukan');

  // Build document lines from PO items
  const lines: Omit<DocumentLine, 'id' | 'document_id' | 'created_at' | 'line_number'>[] = [];
  
  for (const item of po.items || []) {
    const subtotal = (Number(item.quantity)) * Number(item.unit_price || 0)) * 
      (1 - Number(item.discount_percentage || 0) / 100);
    
    lines.push({
      product_id: item.product_id,
      description: item.product?.name || item.notes || 'Produk',
      sku: item.product?.sku,
      batch_number: item.batch_number,
      quantity: Number(item.quantity),
      unit_code: item.unit?.code,
      unit_price: Number(item.unit_price || 0),
      discount_percentage: Number(item.discount_percentage || 0),
      subtotal: subtotal,
      metadata: { po_item_id: item.id },
    });
  }

  // Create document via RPC
  const { data, error } = await supabase.rpc('create_document_from_transaction', {
    p_organization_id: organizationId,
    p_document_type: 'PURCHASE_ORDER',
    p_title: `Purchase Order ${po.po_number}`,
    p_source_type: 'purchase_order',
    p_source_id: poId,
    p_supplier_id: po.supplier_id,
    p_reference_number: po.po_number,
    p_reference_type: 'PO',
    p_notes: po.notes,
    p_created_by: createdBy,
    p_document_lines: JSON.stringify(lines),
  });

  if (error) throw error;
  return data;
}

// ============================================
// GOODS RECEIPT DOCUMENT
// ============================================
export async function createDocumentFromReceiving(params: CreateDocumentFromReceivingParams) {
  const supabase = await createClient();
  const { organizationId, receivingId, createdBy } = params;

  const { data: receiving, error: recError } = await supabase
    .from('receiving_records')
    .select(`
      *,
      supplier:suppliers(*),
      po:purchase_orders(po_number),
      items:receiving_items(
        *,
        product:products(*),
        unit:units(*)
      )
    `)
    .eq('id', receivingId)
    .single();

  if (recError || !receiving) throw new Error('Receiving record tidak ditemukan');

  const lines: Omit<DocumentLine, 'id' | 'document_id' | 'created_at' | 'line_number'>[] = [];
  
  for (const item of receiving.items || []) {
    lines.push({
      product_id: item.product_id,
      description: item.product?.name || 'Produk',
      sku: item.product?.sku,
      batch_number: item.batch_number,
      quantity: Number(item.actual_quantity || item.quantity),
      unit_code: item.unit?.code,
      metadata: { 
        receiving_item_id: item.id,
        ordered_quantity: item.quantity,
        actual_quantity: item.actual_quantity,
        difference: Number(item.actual_quantity || 0) - Number(item.quantity || 0),
      },
    });
  }

  const { data, error } = await supabase.rpc('create_document_from_transaction', {
    p_organization_id: organizationId,
    p_document_type: 'GOODS_RECEIPT',
    p_title: `Goods Receipt ${receiving.receiving_number}`,
    p_source_type: 'receiving_record',
    p_source_id: receivingId,
    p_supplier_id: receiving.supplier_id,
    p_reference_number: receiving.po?.po_number,
    p_reference_type: 'PO',
    p_notes: receiving.notes,
    p_created_by: createdBy,
    p_document_lines: JSON.stringify(lines),
  });

  if (error) throw error;
  return data;
}

// ============================================
// SALES ORDER DOCUMENT
// ============================================
export async function createDocumentFromSalesOrder(params: CreateDocumentFromSOParams) {
  const supabase = await createClient();
  const { organizationId, soId, createdBy } = params;

  const { data: so, error: soError } = await supabase
    .from('sales_orders')
    .select(`
      *,
      customer:customers(*),
      items:sales_order_items(
        *,
        product:products(*),
        unit:units(*)
      )
    `)
    .eq('id', soId)
    .single();

  if (soError || !so) throw new Error('Sales Order tidak ditemukan');

  const lines: Omit<DocumentLine, 'id' | 'document_id' | 'created_at' | 'line_number'>[] = [];
  
  for (const item of so.items || []) {
    const subtotal = (Number(item.quantity)) * Number(item.unit_price || 0)) * 
      (1 - Number(item.discount_percentage || 0) / 100);
    
    lines.push({
      product_id: item.product_id,
      description: item.product?.name || 'Produk',
      sku: item.product?.sku,
      batch_number: item.batch_number,
      quantity: Number(item.quantity),
      unit_code: item.unit?.code,
      unit_price: Number(item.unit_price || 0),
      discount_percentage: Number(item.discount_percentage || 0),
      subtotal: subtotal,
      metadata: { so_item_id: item.id },
    });
  }

  const { data, error } = await supabase.rpc('create_document_from_transaction', {
    p_organization_id: organizationId,
    p_document_type: 'SALES_ORDER',
    p_title: `Sales Order ${so.so_number}`,
    p_source_type: 'sales_order',
    p_source_id: soId,
    p_customer_id: so.customer_id,
    p_reference_number: so.so_number,
    p_reference_type: 'SO',
    p_notes: so.notes,
    p_created_by: createdBy,
    p_document_lines: JSON.stringify(lines),
  });

  if (error) throw error;
  return data;
}

// ============================================
// DELIVERY ORDER / SURAT JALAN DOCUMENT
// ============================================
export async function createDocumentFromDeliveryOrder(params: CreateDocumentFromDOParams) {
  const supabase = await createClient();
  const { organizationId, doId, createdBy } = params;

  const { data: delivery, error: doError } = await supabase
    .from('delivery_orders')
    .select(`
      *,
      customer:customers(*),
      sales_order:sales_orders(so_number),
      items:delivery_order_items(
        *,
        product:products(*),
        unit:units(*)
      )
    `)
    .eq('id', doId)
    .single();

  if (doError || !delivery) throw new Error('Delivery Order tidak ditemukan');

  const lines: Omit<DocumentLine, 'id' | 'document_id' | 'created_at' | 'line_number'>[] = [];
  
  for (const item of delivery.items || []) {
    lines.push({
      product_id: item.product_id,
      description: item.product?.name || 'Produk',
      sku: item.product?.sku,
      batch_number: item.batch_number,
      quantity: Number(item.quantity_delivered),
      unit_code: item.unit?.code,
      metadata: { 
        do_item_id: item.id,
        ordered_quantity: item.quantity_ordered,
        delivered_quantity: item.quantity_delivered,
      },
    });
  }

  // Create both DELIVERY_ORDER and SURAT_JALAN documents
  const results = [];

  const { data: doDoc, error: doDocError } = await supabase.rpc('create_document_from_transaction', {
    p_organization_id: organizationId,
    p_document_type: 'DELIVERY_ORDER',
    p_title: `Delivery Order ${delivery.do_number}`,
    p_source_type: 'delivery_order',
    p_source_id: doId,
    p_customer_id: delivery.customer_id,
    p_reference_number: delivery.sales_order?.so_number,
    p_reference_type: 'SO',
    p_notes: delivery.notes,
    p_created_by: createdBy,
    p_document_lines: JSON.stringify(lines),
  });

  if (doDocError) throw doDocError;
  results.push({ type: 'DELIVERY_ORDER', ...doDoc });

  // Also create SURAT_JALAN
  const { data: sjDoc, error: sjDocError } = await supabase.rpc('create_document_from_transaction', {
    p_organization_id: organizationId,
    p_document_type: 'SURAT_JALAN',
    p_title: `Surat Jalan ${delivery.do_number}`,
    p_source_type: 'delivery_order',
    p_source_id: doId,
    p_customer_id: delivery.customer_id,
    p_reference_number: delivery.sales_order?.so_number,
    p_reference_type: 'SO',
    p_notes: `Delivery Order: ${delivery.do_number}\nKendaraan: ${delivery.vehicle_number || '-'}, Driver: ${delivery.driver_name || '-'}`,
    p_created_by: createdBy,
    p_document_lines: JSON.stringify(lines),
  });

  if (!sjDocError) results.push({ type: 'SURAT_JALAN', ...sjDoc });

  return results;
}

// ============================================
// QC REPORT DOCUMENT
// ============================================
export async function createDocumentFromQCInspection(
  organizationId: string,
  qcId: string,
  createdBy: string
) {
  const supabase = await createClient();

  const { data: qc, error: qcError } = await supabase
    .from('qc_inspections')
    .select(`
      *,
      receiving_record:receiving_records(receiving_number),
      supplier:suppliers(*),
      inspector:profiles!qc_inspections_inspector_id_fkey(full_name)
    `)
    .eq('id', qcId)
    .single();

  if (qcError || !qc) throw new Error('QC Inspection tidak ditemukan');

  const docType: DocumentType = qc.result === 'QUARANTINE' ? 'QUARANTINE_REPORT' : 'QC_REPORT';
  const title = qc.result === 'QUARANTINE' 
    ? `Quarantine Report ${qc.qc_number}`
    : `QC Report ${qc.qc_number}`;

  const { data, error } = await supabase.rpc('create_document_from_transaction', {
    p_organization_id: organizationId,
    p_document_type: docType,
    p_title: title,
    p_source_type: 'qc_inspection',
    p_source_id: qcId,
    p_supplier_id: qc.supplier_id,
    p_reference_number: qc.receiving_record?.receiving_number,
    p_reference_type: 'GR',
    p_notes: `Result: ${qc.result}\\nNotes: ${qc.notes || ''}`,
    p_created_by: createdBy,
    p_document_lines: null,
  });

  if (error) throw error;
  return data;
}

// ============================================
// RENTAL CONTRACT DOCUMENT
// ============================================
export async function createDocumentFromRentalContract(
  organizationId: string,
  contractId: string,
  createdBy: string
) {
  const supabase = await createClient();

  const { data: contract, error } = await supabase
    .from('rental_contracts')
    .select(`
      *,
      customer:customers(*)
    `)
    .eq('id', contractId)
    .single();

  if (error || !contract) throw new Error('Rental Contract tidak ditemukan');

  const { data, error: docError } = await supabase.rpc('create_document_from_transaction', {
    p_organization_id: organizationId,
    p_document_type: 'RENTAL_CONTRACT',
    p_title: `Rental Contract ${contract.contract_number}`,
    p_source_type: 'rental_contract',
    p_source_id: contractId,
    p_customer_id: contract.customer_id,
    p_reference_number: contract.contract_number,
    p_reference_type: 'Contract',
    p_notes: contract.description || contract.notes,
    p_created_by: createdBy,
    p_document_lines: null,
  });

  if (docError) throw docError;
  return data;
}

// ============================================
// PICKING LIST DOCUMENT
// ============================================
export async function createDocumentFromPickingList(
  organizationId: string,
  pickingId: string,
  createdBy: string
) {
  const supabase = await createClient();

  const { data: picking, error } = await supabase
    .from('picking_lists')
    .select(`
      *,
      sales_order:sales_orders(so_number, customer:customers(*)),
      items:picking_list_items(
        *,
        product:products(*),
        inventory:inventory(
          batch_id,
          batch:batches(batch_number, expiry_date),
          storage_location:storage_locations(code)
        )
      )
    `)
    .eq('id', pickingId)
    .single();

  if (error || !picking) throw new Error('Picking List tidak ditemukan');

  const lines: Omit<DocumentLine, 'id' | 'document_id' | 'created_at' | 'line_number'>[] = [];
  
  for (const item of picking.items || []) {
    lines.push({
      product_id: item.product_id,
      description: item.product?.name || 'Produk',
      sku: item.product?.sku,
      batch_number: item.inventory?.batch?.batch_number,
      quantity: Number(item.quantity_picked),
      unit_code: 'KG',
      metadata: {
        picking_item_id: item.id,
        expiry_date: item.inventory?.batch?.expiry_date,
        location: item.inventory?.storage_location?.code,
      },
    });
  }

  const { data, error: docError } = await supabase.rpc('create_document_from_transaction', {
    p_organization_id: organizationId,
    p_document_type: 'PICKING_LIST',
    p_title: `Picking List ${picking.picking_number}`,
    p_source_type: 'picking_list',
    p_source_id: pickingId,
    p_customer_id: picking.sales_order?.customer_id,
    p_reference_number: picking.sales_order?.so_number,
    p_reference_type: 'SO',
    p_notes: `Picker: ${picking.picked_by || '-'}\\nNotes: ${picking.notes || '-'}`,
    p_created_by: createdBy,
    p_document_lines: JSON.stringify(lines),
  });

  if (docError) throw docError;
  return data;
}
