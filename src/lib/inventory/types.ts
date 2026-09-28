// Database types for inventory domain

export type StockStatus = 'AVAILABLE' | 'QUARANTINE' | 'DAMAGED' | 'EXPIRED' | 'BLOCKED';
export type OwnerType = 'COMPANY' | 'CUSTOMER';
export type MovementType = 'RECEIVE' | 'ISSUE' | 'TRANSFER_OUT' | 'TRANSFER_IN' | 'ADJUSTMENT' | 'RETURN' | 'DAMAGE' | 'EXPIRY';
export type AdjustmentType = 'INCREASE' | 'DECREASE';
export type AdjustmentReason = 'COUNT_DIFFERENCE' | 'DAMAGE' | 'EXPIRY' | 'WEIGHT_LOSS' | 'SYSTEM_CORRECTION' | 'OTHER';
export type OpnameStatus = 'PLANNED' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type TransferStatus = 'PENDING' | 'APPROVED' | 'IN_TRANSIT' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
export type BatchStatus = 'ACTIVE' | 'EXPIRED' | 'CONSUMED' | 'DESTROYED';

export interface Batch {
  id: string;
  organization_id: string;
  product_id: string;
  batch_number: string;
  supplier_id?: string;
  supplier_batch_number?: string;
  production_date?: string;
  received_date: string;
  expiry_date?: string;
  best_before_date?: string;
  notes?: string;
  status: BatchStatus;
  created_at: string;
  updated_at: string;
}

export interface Inventory {
  id: string;
  organization_id: string;
  warehouse_id: string;
  cold_storage_id: string;
  storage_location_id: string;
  product_id: string;
  batch_id: string;
  owner_type: OwnerType;
  owner_id: string;
  quantity: number;
  unit_id: string;
  quantity_kg?: number;
  status: StockStatus;
  received_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  organization_id: string;
  movement_number: string;
  movement_type: MovementType;
  transfer_reference_id?: string; // Links TRANSFER_OUT and TRANSFER_IN movements
  inventory_id?: string;
  batch_id: string;
  product_id: string;
  source_warehouse_id?: string;
  source_cold_storage_id?: string;
  source_location_id?: string;
  destination_warehouse_id?: string;
  destination_cold_storage_id?: string;
  destination_location_id?: string;
  owner_type: OwnerType;
  owner_id: string;
  quantity: number;
  unit_id: string;
  quantity_kg?: number;
  source_entity_type?: string;
  source_entity_id?: string;
  reason?: string;
  notes?: string;
  reference_number?: string;
  performed_by: string;
  performed_at: string;
  created_at: string;
}

export interface StockOpname {
  id: string;
  organization_id: string;
  warehouse_id: string;
  cold_storage_id?: string;
  opname_number: string;
  status: OpnameStatus;
  planned_date: string;
  counted_date?: string;
  notes?: string;
  approval_request_id?: string;
  performed_by: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StockOpnameItem {
  id: string;
  opname_id: string;
  inventory_id: string;
  batch_id: string;
  product_id: string;
  storage_location_id: string;
  planned_quantity: number;
  planned_quantity_kg?: number;
  counted_quantity?: number;
  counted_quantity_kg?: number;
  variance_quantity?: number;
  variance_quantity_kg?: number;
  variance_reason?: string;
  photo_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface StockAdjustment {
  id: string;
  organization_id: string;
  adjustment_number: string;
  adjustment_type: AdjustmentType;
  reason: AdjustmentReason;
  notes?: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  approval_request_id?: string;
  performed_by: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StockAdjustmentItem {
  id: string;
  adjustment_id: string;
  inventory_id: string;
  batch_id: string;
  product_id: string;
  current_quantity: number;
  adjusted_quantity: number;
  variance_quantity: number;
  unit_id: string;
  current_quantity_kg?: number;
  adjusted_quantity_kg?: number;
  variance_quantity_kg?: number;
  notes?: string;
  created_at: string;
}

export interface StockTransfer {
  id: string;
  organization_id: string;
  transfer_number: string;
  source_warehouse_id: string;
  source_cold_storage_id: string;
  destination_warehouse_id: string;
  destination_cold_storage_id: string;
  status: TransferStatus;
  notes?: string;
  approval_request_id?: string;
  performed_by: string;
  approved_by?: string;
  approved_at?: string;
  transferred_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StockTransferItem {
  id: string;
  transfer_id: string;
  inventory_id: string;
  batch_id: string;
  product_id: string;
  source_location_id: string;
  destination_location_id: string;
  quantity: number;
  unit_id: string;
  quantity_kg?: number;
  owner_type: OwnerType;
  owner_id: string;
  movement_id?: string;
  created_at: string;
}

// View types
export interface InventorySummary {
  organization_id: string;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  cold_storage_id: string;
  cold_storage_code: string;
  cold_storage_name: string;
  storage_location_id: string;
  location_code: string;
  location_name: string;
  product_id: string;
  sku: string;
  product_name: string;
  batch_id: string;
  batch_number: string;
  expiry_date?: string;
  owner_type: OwnerType;
  owner_id: string;
  owner_name: string;
  quantity: number;
  unit_code: string;
  quantity_kg?: number;
  status: StockStatus;
  received_at?: string;
}

// Capacity types
export interface ColdStorageCapacity {
  total_capacity_kg: number;
  occupied_kg: number;
  available_kg: number;
  utilization_percentage: number;
  company_occupied_kg: number;
  customer_occupied_kg: number;
}

export interface StorageLocationCapacity {
  total_capacity_kg: number;
  occupied_kg: number;
  available_kg: number;
  utilization_percentage: number;
}

// FEFO types
export interface FefoInventory {
  inventory_id: string;
  batch_id: string;
  quantity: number;
  quantity_kg?: number;
  expiry_date?: string;
  received_at?: string;
  cold_storage_id: string;
  storage_location_id: string;
  owner_type: OwnerType;
  owner_id: string;
}

// Stock by status
export interface StockByStatus {
  status: StockStatus;
  total_quantity: number;
  total_quantity_kg: number;
}

// Dashboard types
export interface InventoryDashboard {
  totalStock: number;
  availableStock: number;
  quarantineStock: number;
  expiredStock: number;
  damagedStock: number;
  coldStorageUtilization: {
    cs01: ColdStorageCapacity;
    cs02: ColdStorageCapacity;
  };
  recentMovements: InventoryMovement[];
  expiringBatches: {
    batch_id: string;
    product_name: string;
    batch_number: string;
    expiry_date: string;
    days_until_expiry: number;
    total_quantity: number;
  }[];
}
