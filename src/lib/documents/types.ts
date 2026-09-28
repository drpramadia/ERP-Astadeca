export type DocumentType =
  | 'QUOTATION'
  | 'PURCHASE_REQUEST'
  | 'RFQ'
  | 'PURCHASE_ORDER'
  | 'GOODS_RECEIPT'
  | 'QC_REPORT'
  | 'QUARANTINE_REPORT'
  | 'QUARANTINE_RELEASE'
  | 'STOCK_CARD'
  | 'STOCK_MOVEMENT'
  | 'TRANSFER_NOTE'
  | 'STOCK_OPNAME'
  | 'STOCK_ADJUSTMENT'
  | 'SALES_QUOTATION'
  | 'SALES_ORDER'
  | 'PICKING_LIST'
  | 'DELIVERY_ORDER'
  | 'SURAT_JALAN'
  | 'POD'
  | 'CUSTOMER_RETURN'
  | 'SUPPLIER_RETURN'
  | 'RETURN_RECEIPT'
  | 'RENTAL_QUOTATION'
  | 'RENTAL_CONTRACT'
  | 'RENTAL_RECEIVING'
  | 'RENTAL_STOCK'
  | 'RENTAL_RELEASE'
  | 'RENTAL_BILLING'
  | 'RENTAL_INVOICE'
  | 'SALES_INVOICE'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'PAYMENT_RECEIPT'
  | 'PAYMENT_VOUCHER'
  | 'APPROVAL_SHEET';

export type DocumentStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'ISSUED' | 'CANCELLED' | 'VOID';

export interface Document {
  id: string;
  organization_id: string;
  document_type: DocumentType;
  document_number: string;
  document_date: string;
  status: DocumentStatus;
  source_type?: string;
  source_id?: string;
  title: string;
  subtitle?: string;
  customer_id?: string;
  supplier_id?: string;
  reference_number?: string;
  reference_type?: string;
  file_path?: string;
  file_url?: string;
  verification_token: string;
  metadata: Record<string, unknown>;
  notes?: string;
  issued_at?: string;
  issued_by?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentLine {
  id: string;
  document_id: string;
  line_number: number;
  product_id?: string;
  description?: string;
  sku?: string;
  batch_number?: string;
  quantity?: number;
  unit_code?: string;
  unit_price?: number;
  discount_percentage?: number;
  tax_percentage?: number;
  subtotal?: number;
  metadata: Record<string, unknown>;
  notes?: string;
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  QUOTATION: 'Quotation',
  PURCHASE_REQUEST: 'Purchase Request',
  RFQ: 'Request for Quotation',
  PURCHASE_ORDER: 'Purchase Order',
  GOODS_RECEIPT: 'Goods Receipt',
  QC_REPORT: 'QC Report',
  QUARANTINE_REPORT: 'Quarantine Report',
  QUARANTINE_RELEASE: 'Quarantine Release',
  STOCK_CARD: 'Stock Card',
  STOCK_MOVEMENT: 'Stock Movement',
  TRANSFER_NOTE: 'Transfer Note',
  STOCK_OPNAME: 'Stock Opname',
  STOCK_ADJUSTMENT: 'Stock Adjustment',
  SALES_QUOTATION: 'Sales Quotation',
  SALES_ORDER: 'Sales Order',
  PICKING_LIST: 'Picking List',
  DELIVERY_ORDER: 'Delivery Order',
  SURAT_JALAN: 'Surat Jalan',
  POD: 'Proof of Delivery',
  CUSTOMER_RETURN: 'Customer Return',
  SUPPLIER_RETURN: 'Supplier Return',
  RETURN_RECEIPT: 'Return Receipt',
  RENTAL_QUOTATION: 'Rental Quotation',
  RENTAL_CONTRACT: 'Rental Contract',
  RENTAL_RECEIVING: 'Rental Receiving',
  RENTAL_STOCK: 'Rental Stock Statement',
  RENTAL_RELEASE: 'Rental Release',
  RENTAL_BILLING: 'Rental Billing Statement',
  RENTAL_INVOICE: 'Rental Invoice',
  SALES_INVOICE: 'Sales Invoice',
  CREDIT_NOTE: 'Credit Note',
  DEBIT_NOTE: 'Debit Note',
  PAYMENT_RECEIPT: 'Payment Receipt',
  PAYMENT_VOUCHER: 'Payment Voucher',
  APPROVAL_SHEET: 'Approval Sheet',
};

export const DOCUMENT_CATEGORIES: Record<string, DocumentType[]> = {
  Pembelian: ['QUOTATION', 'PURCHASE_REQUEST', 'RFQ', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'QC_REPORT'],
  Warehouse: ['QUARANTINE_REPORT', 'QUARANTINE_RELEASE', 'STOCK_CARD', 'STOCK_MOVEMENT', 'TRANSFER_NOTE', 'STOCK_OPNAME', 'STOCK_ADJUSTMENT'],
  Penjualan: ['SALES_QUOTATION', 'SALES_ORDER', 'PICKING_LIST', 'DELIVERY_ORDER', 'SURAT_JALAN', 'POD', 'CUSTOMER_RETURN', 'RETURN_RECEIPT', 'SALES_INVOICE'],
  Rental: ['RENTAL_QUOTATION', 'RENTAL_CONTRACT', 'RENTAL_RECEIVING', 'RENTAL_STOCK', 'RENTAL_RELEASE', 'RENTAL_BILLING', 'RENTAL_INVOICE'],
  Keuangan: ['CREDIT_NOTE', 'DEBIT_NOTE', 'PAYMENT_RECEIPT', 'PAYMENT_VOUCHER'],
  Laporan: ['APPROVAL_SHEET'],
};
