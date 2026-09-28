// Rental domain types

// ============================================
// ENUMS
// ============================================

export type ContractStatus = 'DRAFT' | 'SUBMITTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'CANCELLED';
export type BillingFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';
export type RateType = 'STANDARD' | 'CUSTOMER' | 'STORAGE' | 'LOCATION' | 'CATEGORY' | 'PRODUCT';
export type RateStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING_APPROVAL';
export type AllocationStatus = 'ACTIVE' | 'PARTIALLY_RELEASED' | 'RELEASED' | 'TRANSFERRED';
export type RentalMovementType = 'RECEIVE' | 'RELEASE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ADJUSTMENT' | 'DAMAGE' | 'EXPIRY';
export type ChargeStatus = 'PENDING' | 'INVOICED' | 'WAIVED';
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

// ============================================
// RENTAL CONTRACTS
// ============================================

export interface RentalContract {
  id: string;
  organization_id: string;
  contract_number: string;
  customer_id: string;
  title: string;
  description?: string;
  status: ContractStatus;
  start_date: string;
  end_date?: string;
  billing_frequency: BillingFrequency;
  payment_terms_days: number;
  notes?: string;
  terms_and_conditions?: string;
  approval_request_id?: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RentalContractWithCustomer extends RentalContract {
  customers: { name: string; code: string };
}

// ============================================
// RENTAL RATES
// ============================================

export interface RentalRate {
  id: string;
  organization_id: string;
  rate_number: string;
  rate_type: RateType;
  customer_id?: string;
  cold_storage_id?: string;
  storage_location_id?: string;
  product_category_id?: string;
  product_id?: string;
  rate_per_kg_day: number;
  currency: string;
  minimum_quantity_kg: number;
  minimum_days: number;
  discount_percentage: number;
  effective_from: string;
  effective_to?: string;
  status: RateStatus;
  approval_request_id?: string;
  notes?: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// RENTAL ALLOCATIONS
// ============================================

export interface RentalAllocation {
  id: string;
  organization_id: string;
  allocation_number: string;
  contract_id: string;
  customer_id: string;
  inventory_id: string;
  batch_id: string;
  product_id: string;
  warehouse_id: string;
  cold_storage_id: string;
  storage_location_id: string;
  allocated_quantity: number;
  allocated_quantity_kg: number;
  active_quantity_kg: number;
  released_quantity_kg: number;
  status: AllocationStatus;
  allocated_at: string;
  released_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface RentalAllocationWithDetails extends RentalAllocation {
  contracts: { contract_number: string; title: string };
  customers: { name: string };
  products: { name: string; sku: string };
  cold_storages: { name: string; code: string };
  storage_locations: { name: string; code: string };
  batches: { batch_number: string };
}

// ============================================
// RENTAL STOCK MOVEMENTS
// ============================================

export interface RentalStockMovement {
  id: string;
  organization_id: string;
  movement_number: string;
  movement_type: RentalMovementType;
  allocation_id: string;
  contract_id: string;
  customer_id: string;
  inventory_id: string;
  batch_id: string;
  product_id: string;
  source_warehouse_id?: string;
  source_cold_storage_id?: string;
  source_location_id?: string;
  destination_warehouse_id?: string;
  destination_cold_storage_id?: string;
  destination_location_id?: string;
  quantity: number;
  quantity_kg: number;
  rate_id?: string;
  rate_per_kg_day?: number;
  reason?: string;
  notes?: string;
  reference_number?: string;
  transfer_reference_id?: string;
  performed_by: string;
  performed_at: string;
  created_at: string;
}

// ============================================
// RENTAL CHARGES (IMMUTABLE)
// ============================================

export interface RentalCharge {
  id: string;
  organization_id: string;
  charge_number: string;
  contract_id: string;
  allocation_id: string;
  customer_id: string;
  product_id: string;
  cold_storage_id: string;
  storage_location_id?: string;
  billing_start: string;
  billing_end: string;
  quantity_kg_start: number;
  quantity_kg_end: number;
  quantity_kg_average: number;
  days_billed: number;
  rate_id: string;
  rate_per_kg_day: number;
  discount_percentage: number;
  effective_rate_per_kg_day: number;
  subtotal: number;
  discount_amount: number;
  tax_percentage: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  calculation_notes?: string;
  invoice_line_id?: string;
  status: ChargeStatus;
  created_at: string;
}

// ============================================
// RENTAL INVOICES
// ============================================

export interface RentalInvoice {
  id: string;
  organization_id: string;
  invoice_number: string;
  contract_id: string;
  customer_id: string;
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_percentage: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  currency: string;
  status: InvoiceStatus;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RentalInvoiceWithDetails extends RentalInvoice {
  contracts: { contract_number: string; title: string };
  customers: { name: string };
  rental_invoice_lines: RentalInvoiceLine[];
}

export interface RentalInvoiceLine {
  id: string;
  invoice_id: string;
  charge_id: string;
  line_number: number;
  product_id: string;
  product_name: string;
  product_sku?: string;
  cold_storage_name?: string;
  storage_location_name?: string;
  quantity_kg_average: number;
  days_billed: number;
  rate_per_kg_day: number;
  discount_percentage: number;
  subtotal: number;
  discount_amount: number;
  tax_percentage: number;
  tax_amount: number;
  line_total: number;
  currency: string;
  billing_start: string;
  billing_end: string;
  created_at: string;
}

// ============================================
// QUANTITY TIMELINE
// ============================================

export interface RentalQuantitySnapshot {
  id: string;
  allocation_id: string;
  snapshot_date: string;
  quantity_kg: number;
  reason: string;
  reference_id?: string;
  reference_type?: string;
  notes?: string;
  created_at: string;
}

// ============================================
// DASHBOARD TYPES
// ============================================

export interface RentalDashboard {
  activeContracts: number;
  customerStockKg: number;
  occupiedRentalCapacity: number;
  availableCapacity: number;
  todayRevenue: number;
  unbilledCharges: number;
  outstandingInvoices: number;
  upcomingExpiries: {
    contract_id: string;
    contract_number: string;
    customer_name: string;
    end_date: string;
  }[];
  recentReleases: {
    id: string;
    movement_number: string;
    customer_name: string;
    quantity_kg: number;
    performed_at: string;
  }[];
}
