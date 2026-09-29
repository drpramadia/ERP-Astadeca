-- Migration: Add notification triggers for all key events
-- Run: npx supabase db query --linked < this file

-- Inventory levels tracking + low stock notifications
CREATE TABLE IF NOT EXISTS inventory_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  available_quantity NUMERIC NOT NULL DEFAULT 0,
  minimum_stock NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_levels_all_read" ON inventory_levels FOR SELECT USING (true);
CREATE POLICY "inventory_levels_all_write" ON inventory_levels FOR ALL USING (true);

-- Trigger: update inventory_levels after inventory movement
CREATE OR REPLACE FUNCTION sync_inventory_levels()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO inventory_levels (organization_id, warehouse_id, product_id, available_quantity, minimum_stock, updated_at)
  VALUES (NEW.organization_id, NEW.warehouse_id, NEW.product_id, NEW.quantity, COALESCE((SELECT minimum_stock FROM products WHERE id = NEW.product_id), 0), NOW())
  ON CONFLICT (organization_id, warehouse_id, product_id)
  DO UPDATE SET
    available_quantity = COALESCE((
      SELECT SUM(i.quantity)
      FROM inventory i
      WHERE i.organization_id = NEW.organization_id
        AND i.warehouse_id = NEW.warehouse_id
        AND i.product_id = NEW.product_id
        AND i.status != 'BLOCKED'
    ), 0),
    minimum_stock = COALESCE((SELECT minimum_stock FROM products WHERE id = NEW.product_id), 0),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_inventory_levels ON inventory;
CREATE TRIGGER trg_sync_inventory_levels
  AFTER INSERT OR UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION sync_inventory_levels();

-- Low stock notification trigger
CREATE OR REPLACE FUNCTION notify_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.available_quantity < NEW.minimum_stock OR NEW.available_quantity <= 5)
     AND NEW.minimum_stock > 0
  THEN
    INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
    SELECT
      NEW.organization_id,
      u.id,
      'LOW_STOCK',
      '⚠️ Stok Menipis: ' || COALESCE(p.name, NEW.product_id::text),
      'Stok tersisa ' || FLOOR(NEW.available_quantity) || ' unit (min: ' || FLOOR(NEW.minimum_stock) || ')',
      'product',
      NEW.product_id,
      '/warehouse/inventory'
    FROM users u
    JOIN organization_memberships om ON om.user_id = u.id
      AND om.organization_id = NEW.organization_id
      AND om.is_active = true
    WHERE om.role_id IN (
      SELECT id FROM roles WHERE code IN ('SUPER_USER', 'WAREHOUSE', 'ADMIN')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_low_stock ON inventory_levels;
CREATE TRIGGER trg_low_stock
  AFTER INSERT OR UPDATE ON inventory_levels
  FOR EACH ROW EXECUTE FUNCTION notify_low_stock();

-- Notification: quotation created → sales manager
CREATE OR REPLACE FUNCTION notify_quotation_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
  SELECT
    NEW.organization_id,
    u.id,
    'QUOTATION_CREATED',
    '📋 Quotation Baru: ' || COALESCE(q.quotation_number, NEW.id::text),
    'Quotation baru menunggu konfirmasi dari customer.',
    'quotation',
    NEW.id,
    '/supply-chain/sales'
  FROM users u
  JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
  LEFT JOIN quotations q ON q.id = NEW.id
  WHERE om.role_id IN (
    SELECT id FROM roles WHERE code IN ('SUPER_USER', 'DIRECTOR', 'WAREHOUSE', 'ADMIN')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_quotation_created ON quotations;
CREATE TRIGGER trg_quotation_created
  AFTER INSERT ON quotations
  FOR EACH ROW EXECUTE FUNCTION notify_quotation_created();

-- Notification: sales order created → warehouse
CREATE OR REPLACE FUNCTION notify_sales_order_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
  SELECT
    NEW.organization_id,
    u.id,
    'SALES_ORDER_CREATED',
    '📦 Sales Order Baru: ' || COALESCE(NEW.order_number, NEW.id::text),
    'Sales order baru perlu diproses picking & delivery.',
    'sales_order',
    NEW.id,
    '/supply-chain/sales'
  FROM users u
  JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
  WHERE om.role_id IN (
    SELECT id FROM roles WHERE code IN ('SUPER_USER', 'WAREHOUSE', 'ADMIN', 'LOGISTIC')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sales_order_created ON sales_orders;
CREATE TRIGGER trg_sales_order_created
  AFTER INSERT ON sales_orders
  FOR EACH ROW EXECUTE FUNCTION notify_sales_order_created();

-- Notification: PO approved → requester
CREATE OR REPLACE FUNCTION notify_po_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'APPROVED' AND OLD.status != 'APPROVED' THEN
    INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
    SELECT
      NEW.organization_id,
      pr.user_id,
      'PO_APPROVED',
      '✅ Purchase Order Disetujui: ' || COALESCE(NEW.order_number, NEW.id::text),
      'Purchase order Anda telah disetujui oleh approver.',
      'purchase_order',
      NEW.id,
      '/supply-chain/purchasing'
    FROM purchase_requests pr
    WHERE pr.id = NEW.request_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_po_status_change ON purchase_orders;
CREATE TRIGGER trg_po_status_change
  AFTER UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION notify_po_status_change();

-- Notification: delivery order created
CREATE OR REPLACE FUNCTION notify_delivery_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
  SELECT
    NEW.organization_id,
    u.id,
    'DO_CREATED',
    '🚚 Delivery Order: ' || COALESCE(NEW.delivery_number, NEW.id::text),
    'Delivery order baru menunggu proses pengiriman.',
    'delivery_order',
    NEW.id,
    '/supply-chain/delivery'
  FROM users u
  JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
  WHERE om.role_id IN (
    SELECT id FROM roles WHERE code IN ('SUPER_USER', 'WAREHOUSE', 'ADMIN', 'LOGISTIC')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_delivery_created ON delivery_orders;
CREATE TRIGGER trg_delivery_created
  AFTER INSERT ON delivery_orders
  FOR EACH ROW EXECUTE FUNCTION notify_delivery_created();

-- Notification: rental contract created → director
CREATE OR REPLACE FUNCTION notify_contract_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
  SELECT
    NEW.organization_id,
    u.id,
    'CONTRACT_CREATED',
    '📄 Kontrak Baru: ' || COALESCE(NEW.contract_number, NEW.id::text),
    'Kontrak sewa baru perlu direview dan disetujui.',
    'rental_contract',
    NEW.id,
    '/rental/contracts'
  FROM users u
  JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
  WHERE om.role_id IN (
    SELECT id FROM roles WHERE code IN ('SUPER_USER', 'DIRECTOR', 'ADMIN')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_contract_created ON rental_contracts;
CREATE TRIGGER trg_contract_created
  AFTER INSERT ON rental_contracts
  FOR EACH ROW EXECUTE FUNCTION notify_contract_created();

-- Notification: QC completed → requester
CREATE OR REPLACE FUNCTION notify_qc_completed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('PASSED', 'FAILED') AND OLD.status NOT IN ('PASSED', 'FAILED') THEN
    INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
    SELECT
      NEW.organization_id,
      u.id,
      'QC_COMPLETED',
      CASE WHEN NEW.status = 'PASSED' THEN '✅ QC Lulus: ' ELSE '❌ QC Gagal: ' END || COALESCE(NEW.inspection_number, NEW.id::text),
      CASE WHEN NEW.status = 'PASSED' THEN 'Item telah lolos quality control.' ELSE 'Item gagal quality control.' END,
      'qc_inspection',
      NEW.id,
      '/qc'
    FROM users u
    JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
    WHERE om.role_id IN (
      SELECT id FROM roles WHERE code IN ('SUPER_USER', 'QC', 'WAREHOUSE', 'ADMIN')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_qc_completed ON qc_inspections;
CREATE TRIGGER trg_qc_completed
  AFTER UPDATE ON qc_inspections
  FOR EACH ROW EXECUTE FUNCTION notify_qc_completed();

-- Notification: approval request → approver
CREATE OR REPLACE FUNCTION notify_approval_requested()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'PENDING' AND (OLD.status IS NULL OR OLD.status != 'PENDING') THEN
    INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
    SELECT
      NEW.organization_id,
      u.id,
      'APPROVAL_REQUIRED',
      '🔔 Approval Required: ' || COALESCE(NEW.document_number, NEW.id::text),
      'Ada dokumen yang memerlukan persetujuan Anda.',
      'approval_request',
      NEW.id,
      '/approval'
    FROM users u
    JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
    WHERE om.role_id = NEW.approver_role_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_approval_requested ON approval_requests;
CREATE TRIGGER trg_approval_requested
  AFTER INSERT OR UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION notify_approval_requested();

-- Enable RLS on notifications (keep existing policies)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Ensure all active users can read their own notifications
CREATE POLICY "Users read own notifications"
  ON notifications FOR SELECT
  USING (recipient_user_id = auth.uid());

CREATE POLICY "System inserts notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (recipient_user_id = auth.uid());
