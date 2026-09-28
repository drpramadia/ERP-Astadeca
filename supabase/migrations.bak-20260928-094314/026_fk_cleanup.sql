-- Migration: 026_fk_cleanup.sql
-- Add missing FKs to supply chain tables only
-- Safe: skips tables that don't have FK-ready columns
-- Date: 2026-09-27

DO $$
BEGIN
  -- purchase_requests
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pr_org_fk') THEN
    ALTER TABLE purchase_requests ADD CONSTRAINT pr_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pr_supplier_fk') THEN
    ALTER TABLE purchase_requests ADD CONSTRAINT pr_supplier_fk FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pr_requester_fk') THEN
    ALTER TABLE purchase_requests ADD CONSTRAINT pr_requester_fk FOREIGN KEY (requester_id) REFERENCES profiles(id);
  END IF;

  -- purchase_request_items
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pri_pr_fk') THEN
    ALTER TABLE purchase_request_items ADD CONSTRAINT pri_pr_fk FOREIGN KEY (pr_id) REFERENCES purchase_requests(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pri_product_fk') THEN
    ALTER TABLE purchase_request_items ADD CONSTRAINT pri_product_fk FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;

  -- purchase_orders
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'po_org_fk') THEN
    ALTER TABLE purchase_orders ADD CONSTRAINT po_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'po_supplier_fk') THEN
    ALTER TABLE purchase_orders ADD CONSTRAINT po_supplier_fk FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'po_created_by_fk') THEN
    ALTER TABLE purchase_orders ADD CONSTRAINT po_created_by_fk FOREIGN KEY (created_by) REFERENCES profiles(id);
  END IF;

  -- purchase_order_items
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poi_po_fk') THEN
    ALTER TABLE purchase_order_items ADD CONSTRAINT poi_po_fk FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'poi_product_fk') THEN
    ALTER TABLE purchase_order_items ADD CONSTRAINT poi_product_fk FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;

  -- receiving_records
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rr_org_fk') THEN
    ALTER TABLE receiving_records ADD CONSTRAINT rr_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rr_po_fk') THEN
    ALTER TABLE receiving_records ADD CONSTRAINT rr_po_fk FOREIGN KEY (po_id) REFERENCES purchase_orders(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rr_supplier_fk') THEN
    ALTER TABLE receiving_records ADD CONSTRAINT rr_supplier_fk FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
  END IF;

  -- receiving_items
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ri_receiving_fk') THEN
    ALTER TABLE receiving_items ADD CONSTRAINT ri_receiving_fk FOREIGN KEY (receiving_id) REFERENCES receiving_records(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ri_product_fk') THEN
    ALTER TABLE receiving_items ADD CONSTRAINT ri_product_fk FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ri_cs_fk') THEN
    ALTER TABLE receiving_items ADD CONSTRAINT ri_cs_fk FOREIGN KEY (cold_storage_id) REFERENCES cold_storages(id);
  END IF;

  -- qc_inspections
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qi_org_fk') THEN
    ALTER TABLE qc_inspections ADD CONSTRAINT qi_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qi_receiving_fk') THEN
    ALTER TABLE qc_inspections ADD CONSTRAINT qi_receiving_fk FOREIGN KEY (receiving_id) REFERENCES receiving_records(id);
  END IF;

  -- sales_orders
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'so_org_fk') THEN
    ALTER TABLE sales_orders ADD CONSTRAINT so_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'so_customer_fk') THEN
    ALTER TABLE sales_orders ADD CONSTRAINT so_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'so_created_by_fk') THEN
    ALTER TABLE sales_orders ADD CONSTRAINT so_created_by_fk FOREIGN KEY (created_by) REFERENCES profiles(id);
  END IF;

  -- sales_order_items
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'soi_so_fk') THEN
    ALTER TABLE sales_order_items ADD CONSTRAINT soi_so_fk FOREIGN KEY (so_id) REFERENCES sales_orders(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'soi_product_fk') THEN
    ALTER TABLE sales_order_items ADD CONSTRAINT soi_product_fk FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;

  -- quotations
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qt_org_fk') THEN
    ALTER TABLE quotations ADD CONSTRAINT qt_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qt_customer_fk') THEN
    ALTER TABLE quotations ADD CONSTRAINT qt_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id);
  END IF;

  -- quotation_items
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qti_qt_fk') THEN
    ALTER TABLE quotation_items ADD CONSTRAINT qti_qt_fk FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'qti_product_fk') THEN
    ALTER TABLE quotation_items ADD CONSTRAINT qti_product_fk FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;

  -- delivery_orders
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'do_org_fk') THEN
    ALTER TABLE delivery_orders ADD CONSTRAINT do_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'do_so_fk') THEN
    ALTER TABLE delivery_orders ADD CONSTRAINT do_so_fk FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'do_customer_fk') THEN
    ALTER TABLE delivery_orders ADD CONSTRAINT do_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id);
  END IF;

  -- delivery_order_items
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dori_do_fk') THEN
    ALTER TABLE delivery_order_items ADD CONSTRAINT dori_do_fk FOREIGN KEY (delivery_id) REFERENCES delivery_orders(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dori_product_fk') THEN
    ALTER TABLE delivery_order_items ADD CONSTRAINT dori_product_fk FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;

  -- returns
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ret_org_fk') THEN
    ALTER TABLE returns ADD CONSTRAINT ret_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ret_customer_fk') THEN
    ALTER TABLE returns ADD CONSTRAINT ret_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ret_supplier_fk') THEN
    ALTER TABLE returns ADD CONSTRAINT ret_supplier_fk FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
  END IF;

  -- return_items
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reti_ret_fk') THEN
    ALTER TABLE return_items ADD CONSTRAINT reti_ret_fk FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reti_product_fk') THEN
    ALTER TABLE return_items ADD CONSTRAINT reti_product_fk FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;

  -- rental_contracts FKs (for completeness)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rc_org_fk') THEN
    ALTER TABLE rental_contracts ADD CONSTRAINT rc_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rc_customer_fk') THEN
    ALTER TABLE rental_contracts ADD CONSTRAINT rc_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rc_cs_fk') THEN
    ALTER TABLE rental_contracts ADD CONSTRAINT rc_cs_fk FOREIGN KEY (cold_storage_id) REFERENCES cold_storages(id);
  END IF;

  -- rental_allocations
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ra_contract_fk') THEN
    ALTER TABLE rental_allocations ADD CONSTRAINT ra_contract_fk FOREIGN KEY (contract_id) REFERENCES rental_contracts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ra_product_fk') THEN
    ALTER TABLE rental_allocations ADD CONSTRAINT ra_product_fk FOREIGN KEY (product_id) REFERENCES products(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ra_cs_fk') THEN
    ALTER TABLE rental_allocations ADD CONSTRAINT ra_cs_fk FOREIGN KEY (cold_storage_id) REFERENCES cold_storages(id);
  END IF;

  -- rental_charges
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rch_contract_fk') THEN
    ALTER TABLE rental_charges ADD CONSTRAINT rch_contract_fk FOREIGN KEY (contract_id) REFERENCES rental_contracts(id);
  END IF;

  -- rental_invoices
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ri_org_fk') THEN
    ALTER TABLE rental_invoices ADD CONSTRAINT ri_org_fk FOREIGN KEY (organization_id) REFERENCES organizations(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ri_contract_fk') THEN
    ALTER TABLE rental_invoices ADD CONSTRAINT ri_contract_fk FOREIGN KEY (contract_id) REFERENCES rental_contracts(id);
  END IF;

  -- rental_invoice_lines
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ril_ri_fk') THEN
    ALTER TABLE rental_invoice_lines ADD CONSTRAINT ril_ri_fk FOREIGN KEY (invoice_id) REFERENCES rental_invoices(id) ON DELETE CASCADE;
  END IF;

END;
$$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_pr_org ON purchase_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_po_org ON purchase_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_created_by ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_rr_org ON receiving_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_rr_status ON receiving_records(status);
CREATE INDEX IF NOT EXISTS idx_rr_po ON receiving_records(po_id);
CREATE INDEX IF NOT EXISTS idx_ri_receiving ON receiving_items(receiving_id);
CREATE INDEX IF NOT EXISTS idx_so_org ON sales_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_soi_so ON sales_order_items(so_id);
CREATE INDEX IF NOT EXISTS idx_dor_org ON delivery_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_dor_status ON delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_dor_so ON delivery_orders(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_ret_org ON returns(organization_id);
CREATE INDEX IF NOT EXISTS idx_ret_status ON returns(status);
CREATE INDEX IF NOT EXISTS idx_qt_org ON quotations(organization_id);
CREATE INDEX IF NOT EXISTS idx_qt_status ON quotations(status);
