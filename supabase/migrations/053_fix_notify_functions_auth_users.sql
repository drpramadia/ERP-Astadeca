-- Migration: 053_fix_notify_functions_auth_users.sql
--
-- Two defects in the notification trigger functions, both of which abort the
-- business statement that fires them because every one of these runs as an
-- AFTER INSERT/UPDATE trigger:
--
-- 1) `FROM users` referenced a table that does not exist. The auth table is
--    `auth.users`, and these functions have no SET search_path, so the name
--    failed to resolve:
--        ERROR: relation "users" does not exist
--    Creating a rental contract therefore returned
--        Gagal membuat kontrak: relation "users" does not exist
--    and no contract row was persisted. The same abort hit approval requests,
--    deliveries, low-stock updates, QC completion, quotations and sales orders.
--
-- 2) notify_low_stock referenced the alias `p.name` with no `p` in scope:
--        ERROR: missing FROM-clause entry for table "p"
--    The product name is now resolved with a scalar subquery instead.
--
-- Each function below is the verbatim current definition with only those two
-- expressions rewritten; all other logic is unchanged. Bodies are stored
-- without `SET search_path`, matching the originals.
--
-- Date: 2026-09-29


-- ---------- notify_approval_requested ----------
CREATE OR REPLACE FUNCTION public.notify_approval_requested()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    FROM auth.users u
    JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
    WHERE om.role_id = NEW.approver_role_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------- notify_contract_created ----------
CREATE OR REPLACE FUNCTION public.notify_contract_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  FROM auth.users u
  JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
  WHERE om.role_id IN (
    SELECT id FROM roles WHERE code IN ('SUPER_USER', 'DIRECTOR', 'ADMIN')
  );
  RETURN NEW;
END;
$function$;

-- ---------- notify_delivery_created ----------
CREATE OR REPLACE FUNCTION public.notify_delivery_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  FROM auth.users u
  JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
  WHERE om.role_id IN (
    SELECT id FROM roles WHERE code IN ('SUPER_USER', 'WAREHOUSE', 'ADMIN', 'LOGISTIC')
  );
  RETURN NEW;
END;
$function$;

-- ---------- notify_low_stock ----------
CREATE OR REPLACE FUNCTION public.notify_low_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF (NEW.available_quantity < NEW.minimum_stock OR NEW.available_quantity <= 5)
     AND NEW.minimum_stock > 0
  THEN
    INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
    SELECT
      NEW.organization_id,
      u.id,
      'LOW_STOCK',
      '⚠️ Stok Menipis: ' || COALESCE((SELECT pr.name FROM public.products pr WHERE pr.id = NEW.product_id), NEW.product_id::text),
      'Stok tersisa ' || FLOOR(NEW.available_quantity) || ' unit (min: ' || FLOOR(NEW.minimum_stock) || ')',
      'product',
      NEW.product_id,
      '/warehouse/inventory'
    FROM auth.users u
    JOIN organization_memberships om ON om.user_id = u.id
      AND om.organization_id = NEW.organization_id
      AND om.is_active = true
    WHERE om.role_id IN (
      SELECT id FROM roles WHERE code IN ('SUPER_USER', 'WAREHOUSE', 'ADMIN')
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------- notify_qc_completed ----------
CREATE OR REPLACE FUNCTION public.notify_qc_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    FROM auth.users u
    JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
    WHERE om.role_id IN (
      SELECT id FROM roles WHERE code IN ('SUPER_USER', 'QC', 'WAREHOUSE', 'ADMIN')
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------- notify_quotation_created ----------
CREATE OR REPLACE FUNCTION public.notify_quotation_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  FROM auth.users u
  JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
  LEFT JOIN quotations q ON q.id = NEW.id
  WHERE om.role_id IN (
    SELECT id FROM roles WHERE code IN ('SUPER_USER', 'DIRECTOR', 'WAREHOUSE', 'ADMIN')
  );
  RETURN NEW;
END;
$function$;

-- ---------- notify_sales_order_created ----------
CREATE OR REPLACE FUNCTION public.notify_sales_order_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  FROM auth.users u
  JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
  WHERE om.role_id IN (
    SELECT id FROM roles WHERE code IN ('SUPER_USER', 'WAREHOUSE', 'ADMIN', 'LOGISTIC')
  );
  RETURN NEW;
END;
$function$;
