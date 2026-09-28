import { createClient } from "@/lib/supabase/server";

export interface Organization {
  id: string;
  name: string;
  code: string;
}

export interface BusinessUnit {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  unit_type: string;
}

export interface Warehouse {
  id: string;
  organization_id: string;
  business_unit_id?: string;
  code: string;
  name: string;
  warehouse_type: string;
}

export interface ColdStorage {
  id: string;
  organization_id: string;
  warehouse_id: string;
  code: string;
  name: string;
  capacity_kg: number;
  temperature_min_c?: number;
  temperature_max_c?: number;
  status: string;
}

export interface StorageLocation {
  id: string;
  organization_id: string;
  cold_storage_id: string;
  code: string;
  name: string;
  aisle?: string;
  rack?: string;
  level?: string;
  capacity_kg: number;
}

export interface ProductCategory {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description?: string;
}

export interface Unit {
  id: string;
  organization_id: string;
  code: string;
  name: string;
}

export interface Product {
  id: string;
  organization_id: string;
  category_id?: string;
  unit_id?: string;
  sku: string;
  name: string;
  description?: string;
  brand?: string;
  purchase_price: number;
  selling_price: number;
  min_stock: number;
  max_stock?: number;
  track_batch: boolean;
  track_expiry: boolean;
}

export interface Supplier {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  supplier_type?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_terms_days: number;
}

export interface Customer {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  customer_type?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_supply_chain_customer: boolean;
  is_rental_customer: boolean;
  payment_terms_days: number;
}

export async function getOrganizationData(organizationId: string) {
  const supabase = await createClient();
  
  const [
    { data: businessUnits },
    { data: warehouses },
    { data: coldStorages },
    { data: locations },
    { data: categories },
    { data: units },
    { data: products },
    { data: suppliers },
    { data: customers },
  ] = await Promise.all([
    supabase.from("business_units").select("*").eq("organization_id", organizationId).eq("active", true),
    supabase.from("warehouses").select("*").eq("organization_id", organizationId).eq("active", true),
    supabase.from("cold_storages").select("*").eq("organization_id", organizationId).eq("status", "ACTIVE"),
    supabase.from("storage_locations").select("*").eq("organization_id", organizationId).eq("active", true),
    supabase.from("product_categories").select("*").eq("organization_id", organizationId).eq("active", true),
    supabase.from("units").select("*").eq("organization_id", organizationId).eq("active", true),
    supabase.from("products").select("*").eq("organization_id", organizationId).eq("active", true).order("name"),
    supabase.from("suppliers").select("*").eq("organization_id", organizationId).eq("active", true),
    supabase.from("customers").select("*").eq("organization_id", organizationId).eq("active", true),
  ]);

  return {
    businessUnits: (businessUnits || []) as BusinessUnit[],
    warehouses: (warehouses || []) as Warehouse[],
    coldStorages: (coldStorages || []) as ColdStorage[],
    locations: (locations || []) as StorageLocation[],
    categories: (categories || []) as ProductCategory[],
    units: (units || []) as Unit[],
    products: (products || []) as Product[],
    suppliers: (suppliers || []) as Supplier[],
    customers: (customers || []) as Customer[],
  };
}
