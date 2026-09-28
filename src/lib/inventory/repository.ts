import { createClient } from '@/lib/supabase/server';
import type {
  Batch,
  Inventory,
  InventoryMovement,
  StockOpname,
  StockAdjustment,
  StockTransfer,
  InventorySummary,
  ColdStorageCapacity,
  StorageLocationCapacity,
  FefoInventory,
  StockByStatus,
  StockStatus,
  MovementType,
  OwnerType,
} from './types';

// ============================================
// BATCH OPERATIONS
// ============================================

export async function getBatches(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('batches')
    .select('*, products(name, sku), suppliers(name)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as (Batch & { products: { name: string; sku: string }; suppliers?: { name: string } })[];
}

export async function getBatchById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('batches')
    .select('*, products(*), suppliers(*)')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data as Batch;
}

export async function createBatch(batch: Partial<Batch>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('batches')
    .insert(batch)
    .select()
    .single();
  
  if (error) throw error;
  return data as Batch;
}

export async function updateBatch(id: string, updates: Partial<Batch>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('batches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data as Batch;
}

// ============================================
// INVENTORY OPERATIONS
// ============================================

export async function getInventory(organizationId: string, filters?: {
  warehouseId?: string;
  coldStorageId?: string;
  productId?: string;
  status?: StockStatus;
  ownerType?: OwnerType;
  ownerId?: string;
}) {
  const supabase = await createClient();
  
  let query = supabase
    .from('inventory')
    .select(`
      *,
      products(name, sku),
      batches(batch_number, expiry_date),
      cold_storages(name, code),
      storage_locations(name, code),
      units(code)
    `)
    .eq('organization_id', organizationId);
  
  if (filters?.warehouseId) {
    query = query.eq('warehouse_id', filters.warehouseId);
  }
  if (filters?.coldStorageId) {
    query = query.eq('cold_storage_id', filters.coldStorageId);
  }
  if (filters?.productId) {
    query = query.eq('product_id', filters.productId);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.ownerType) {
    query = query.eq('owner_type', filters.ownerType);
  }
  if (filters?.ownerId) {
    query = query.eq('owner_id', filters.ownerId);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as (Inventory & { 
    products: { name: string; sku: string };
    batches: { batch_number: string; expiry_date?: string };
    cold_storages: { name: string; code: string };
    storage_locations: { name: string; code: string };
    units: { code: string };
  })[];
}

export async function getInventorySummary(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_summary')
    .select('*')
    .eq('organization_id', organizationId)
    .order('product_name');
  
  if (error) throw error;
  return data as InventorySummary[];
}

// ============================================
// MOVEMENT OPERATIONS
// ============================================

export async function getMovements(organizationId: string, filters?: {
  movementType?: MovementType;
  productId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const supabase = await createClient();
  
  let query = supabase
    .from('inventory_movements')
    .select(`
      *,
      products(name, sku),
      batches(batch_number),
      profiles!inventory_movements_performed_by_fkey(full_name)
    `)
    .eq('organization_id', organizationId)
    .order('performed_at', { ascending: false });
  
  if (filters?.movementType) {
    query = query.eq('movement_type', filters.movementType);
  }
  if (filters?.productId) {
    query = query.eq('product_id', filters.productId);
  }
  if (filters?.startDate) {
    query = query.gte('performed_at', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('performed_at', filters.endDate);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  return data as (InventoryMovement & {
    products: { name: string; sku: string };
    batches: { batch_number: string };
    profiles: { full_name?: string };
  })[];
}

export async function getMovementById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data as InventoryMovement;
}

// ============================================
// FEFO QUERY
// ============================================

export async function getFefoInventory(
  organizationId: string,
  productId: string,
  requiredQuantity: number,
  options?: {
    ownerType?: OwnerType;
    ownerId?: string;
    coldStorageId?: string;
  }
) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .rpc('get_fefo_inventory', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_required_quantity: requiredQuantity,
      p_owner_type: options?.ownerType ?? null,
      p_owner_id: options?.ownerId ?? null,
      p_cold_storage_id: options?.coldStorageId ?? null,
      p_storage_location_id: null
    });
  
  if (error) throw error;
  return data as FefoInventory[];
}

// ============================================
// STOCK CALCULATIONS
// ============================================

export async function getStockByStatus(organizationId: string, warehouseId?: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .rpc('get_stock_by_status', {
      p_organization_id: organizationId,
      p_warehouse_id: warehouseId ?? null,
      p_cold_storage_id: null
    });
  
  if (error) throw error;
  return data as StockByStatus[];
}

export async function getAvailableStockByProduct(
  organizationId: string,
  productId: string,
  ownerType?: OwnerType,
  ownerId?: string
) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .rpc('get_available_stock_by_product', {
      p_organization_id: organizationId,
      p_product_id: productId,
      p_owner_type: ownerType ?? null,
      p_owner_id: ownerId ?? null
    });
  
  if (error) throw error;
  return data as { total_quantity: number; total_quantity_kg: number }[];
}

// ============================================
// CAPACITY OPERATIONS
// ============================================

export async function getColdStorageCapacity(coldStorageId: string) {
  const supabase = await createClient();

  const [coldStorageResult, inventoryResult] = await Promise.all([
    supabase.from('cold_storages').select('capacity_kg').eq('id', coldStorageId).single(),
    supabase
      .from('inventory')
      .select('owner_type, quantity_kg, status')
      .eq('cold_storage_id', coldStorageId)
      .in('status', ['AVAILABLE', 'QUARANTINE']),
  ]);

  if (coldStorageResult.error) throw coldStorageResult.error;
  if (inventoryResult.error) throw inventoryResult.error;

  const totalCapacity = Number(coldStorageResult.data.capacity_kg || 0);
  const occupiedByOwner = (ownerType: OwnerType) => (inventoryResult.data || [])
    .filter((item) => item.owner_type === ownerType)
    .reduce((total, item) => total + Number(item.quantity_kg || 0), 0);
  const companyOccupied = occupiedByOwner('COMPANY');
  const customerOccupied = occupiedByOwner('CUSTOMER');
  const occupied = companyOccupied + customerOccupied;

  return [{
    total_capacity_kg: totalCapacity,
    occupied_kg: occupied,
    available_kg: totalCapacity - occupied,
    utilization_percentage: totalCapacity > 0 ? occupied / totalCapacity * 100 : 0,
    company_occupied_kg: companyOccupied,
    customer_occupied_kg: customerOccupied,
  }] as ColdStorageCapacity[];
}

export async function getStorageLocationCapacity(locationId: string) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .rpc('get_storage_location_capacity', {
      p_storage_location_id: locationId
    });
  
  if (error) throw error;
  return data as StorageLocationCapacity[];
}

// ============================================
// EXPIRING BATCHES
// ============================================

export async function getExpiringBatches(
  organizationId: string,
  daysAhead: number = 30,
  limit: number = 50
) {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .rpc('get_expiring_batches', {
      p_organization_id: organizationId,
      p_days_ahead: daysAhead,
      p_limit: limit
    });
  
  if (error) throw error;
  return data;
}

// ============================================
// RECEIVE INVENTORY (RPC)
// ============================================

export async function receiveInventory(params: {
  organizationId: string;
  warehouseId: string;
  coldStorageId: string;
  storageLocationId: string;
  productId: string;
  batchId: string;
  ownerType: OwnerType;
  ownerId: string;
  quantity: number;
  unitId: string;
  quantityKg?: number;
  referenceNumber?: string;
  notes?: string;
}) {
  const supabase = await createClient();
  
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('User not authenticated');
  
  const { data, error } = await supabase
    .rpc('receive_inventory', {
      p_organization_id: params.organizationId,
      p_warehouse_id: params.warehouseId,
      p_cold_storage_id: params.coldStorageId,
      p_storage_location_id: params.storageLocationId,
      p_product_id: params.productId,
      p_batch_id: params.batchId,
      p_owner_type: params.ownerType,
      p_owner_id: params.ownerId,
      p_quantity: params.quantity,
      p_unit_id: params.unitId,
      p_quantity_kg: params.quantityKg ?? null,
      p_reference_number: params.referenceNumber ?? null,
      p_notes: params.notes ?? null,
      p_performed_by: userData.user.id
    });
  
  if (error) throw error;
  return data;
}

// ============================================
// ISSUE INVENTORY FEFO (RPC)
// ============================================

export async function issueInventoryFefo(params: {
  organizationId: string;
  productId: string;
  requiredQuantity: number;
  ownerType?: OwnerType;
  ownerId?: string;
  reason?: string;
  notes?: string;
  referenceNumber?: string;
}) {
  const supabase = await createClient();
  
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('User not authenticated');
  
  const { data, error } = await supabase
    .rpc('issue_inventory_fefo', {
      p_organization_id: params.organizationId,
      p_product_id: params.productId,
      p_required_quantity: params.requiredQuantity,
      p_owner_type: params.ownerType ?? null,
      p_owner_id: params.ownerId ?? null,
      p_reason: params.reason ?? null,
      p_notes: params.notes ?? null,
      p_reference_number: params.referenceNumber ?? null,
      p_performed_by: userData.user.id
    });
  
  if (error) throw error;
  return data;
}

// ============================================
// TRANSFER INVENTORY (RPC)
// ============================================

export async function transferInventory(params: {
  organizationId: string;
  sourceInventoryId: string;
  destinationLocationId: string;
  quantity: number;
  notes?: string;
}) {
  const supabase = await createClient();
  
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('User not authenticated');
  
  const { data, error } = await supabase
    .rpc('transfer_inventory', {
      p_organization_id: params.organizationId,
      p_source_inventory_id: params.sourceInventoryId,
      p_destination_location_id: params.destinationLocationId,
      p_quantity: params.quantity,
      p_notes: params.notes ?? null,
      p_performed_by: userData.user.id
    });
  
  if (error) throw error;
  return data;
}

// ============================================
// STOCK OPNAME OPERATIONS
// ============================================

export async function getStockOpnames(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_opnames')
    .select('*, cold_storages(name, code), profiles!stock_opnames_performed_by_fkey(full_name)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function getStockOpnameById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_opnames')
    .select('*, stock_opname_items(*, products(name, sku), batches(batch_number), storage_locations(name, code))')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

export async function createStockOpname(opname: Partial<StockOpname>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_opnames')
    .insert(opname)
    .select()
    .single();
  
  if (error) throw error;
  return data as StockOpname;
}

// ============================================
// STOCK ADJUSTMENT OPERATIONS
// ============================================

export async function getStockAdjustments(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_adjustments')
    .select('*, stock_adjustment_items(*, products(name, sku))')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function getStockAdjustmentById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_adjustments')
    .select('*, stock_adjustment_items(*, products(name, sku))')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

export async function createStockAdjustment(adjustment: Partial<StockAdjustment>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_adjustments')
    .insert(adjustment)
    .select()
    .single();
  
  if (error) throw error;
  return data as StockAdjustment;
}

// ============================================
// STOCK TRANSFER OPERATIONS
// ============================================

export async function getStockTransfers(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_transfers')
    .select('*, cold_storages!stock_transfers_source_cold_storage_fkey(name, code)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function getStockTransferById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_transfers')
    .select('*, stock_transfer_items(*, products(name, sku), storage_locations!stock_transfer_items_source_location_fkey(name, code))')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

export async function createStockTransfer(transfer: Partial<StockTransfer>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stock_transfers')
    .insert(transfer)
    .select()
    .single();
  
  if (error) throw error;
  return data as StockTransfer;
}
