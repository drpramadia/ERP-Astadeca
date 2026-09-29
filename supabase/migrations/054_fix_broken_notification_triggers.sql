-- Migration: 054_fix_broken_notification_triggers.sql
--
-- Seven AFTER INSERT/UPDATE triggers referenced columns that do not exist on
-- their tables. Because a trigger error aborts the whole statement, each of
-- them silently blocked the business operation that fired it — the user saw
-- errors such as:
--     Gagal submit kontrak: record "new" has no field "document_number"
--     Gagal membuat kontrak: relation "users" does not exist
--
-- Confirmed by auditing every trigger in public against
-- information_schema.columns (42 triggers / 68 tables -> 7 faulty):
--
--   table               trigger                        function                            missing
--   approval_requests   trg_approval_requested         notify_approval_requested           document_number, approver_role_id
--   delivery_orders     trg_delivery_created           notify_delivery_created             delivery_number
--   purchase_orders     trg_notification_po_status     notification_on_document_status_change  pr_number, so_number
--   purchase_orders     trg_po_status_change           notify_po_status_change             order_number, request_id
--   qc_inspections      trg_qc_completed               notify_qc_completed                 inspection_number
--   sales_orders        trg_notification_so_status     notification_on_document_status_change  po_number, pr_number
--   sales_orders        trg_sales_order_created        notify_sales_order_created          order_number
--
-- Fixes:
--   * delivery_orders:  delivery_number            -> do_number
--   * qc_inspections:   inspection_number          -> qc_number
--   * sales_orders:     order_number               -> so_number
--   * purchase_orders:  order_number               -> po_number
--   * approval_requests: document_number is gone; the notification now uses
--     title/entity_type. approver_role_id lives on approval_steps, not on
--     approval_requests, so approvers are resolved through that table.
--   * notify_po_status_change joined purchase_requests via NEW.request_id,
--     but purchase_orders has no link to purchase_requests. The requester is
--     now the PO creator (created_by), which is the real column available.
--   * notification_on_document_status_change is shared by purchase_orders and
--     sales_orders and read all three number columns at once; it now reads them
--     via to_jsonb(NEW)->>'col', which yields NULL instead of raising when a
--     table lacks that column.
--   * Every function is pinned with SET search_path TO 'public' to match the
--     codebase's SECURITY DEFINER convention.
--
-- Date: 2026-09-29


-- ---------- notify_delivery_created ----------
CREATE OR REPLACE FUNCTION public.notify_delivery_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
  SELECT
    NEW.organization_id,
    u.id,
    'DO_CREATED',
    '🚚 Delivery Order: ' || COALESCE(NEW.do_number, NEW.id::text),
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

-- ---------- notify_qc_completed ----------
CREATE OR REPLACE FUNCTION public.notify_qc_completed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('PASSED', 'FAILED') AND OLD.status NOT IN ('PASSED', 'FAILED') THEN
    INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
    SELECT
      NEW.organization_id,
      u.id,
      'QC_COMPLETED',
      CASE WHEN NEW.status = 'PASSED' THEN '✅ QC Lulus: ' ELSE '❌ QC Gagal: ' END || COALESCE(NEW.qc_number, NEW.id::text),
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

-- ---------- notify_sales_order_created ----------
CREATE OR REPLACE FUNCTION public.notify_sales_order_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
  SELECT
    NEW.organization_id,
    u.id,
    'SALES_ORDER_CREATED',
    '📦 Sales Order Baru: ' || COALESCE(NEW.so_number, NEW.id::text),
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

-- ---------- notification_on_document_status_change ----------
CREATE OR REPLACE FUNCTION public.notification_on_document_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.status = 'PENDING_APPROVAL' AND OLD.status IN ('DRAFT', 'SUBMITTED') THEN
        PERFORM public.notify_org_permission_holders(
            NEW.organization_id,
            'approval.approve',
            auth.uid(),
            'WARNING',
            'Dokumen Menunggu Persetujuan',
            'Dokumen ' || COALESCE(to_jsonb(NEW) ->> 'po_number', to_jsonb(NEW) ->> 'pr_number', to_jsonb(NEW) ->> 'so_number', '') ||
            ' membutuhkan persetujuan Anda',
            '/approval',
            COALESCE(to_jsonb(NEW) ->> 'po_number', to_jsonb(NEW) ->> 'pr_number', to_jsonb(NEW) ->> 'so_number', 'document'),
            NEW.id
        );
    END IF;
    RETURN NEW;
END;
$function$;

-- ---------- notify_approval_requested ----------
CREATE OR REPLACE FUNCTION public.notify_approval_requested()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'PENDING' AND (OLD.status IS NULL OR OLD.status != 'PENDING') THEN
    INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
    SELECT
      NEW.organization_id,
      u.id,
      'APPROVAL_REQUIRED',
      '🔔 Approval Required: ' || COALESCE(NEW.title, NEW.entity_type, NEW.id::text),
      'Ada dokumen yang memerlukan persetujuan Anda.',
      'approval_request',
      NEW.id,
      '/approval'
    FROM auth.users u
    JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = NEW.organization_id AND om.is_active = true
    WHERE om.role_id IN (
      SELECT s.approver_role_id FROM approval_steps s
      WHERE s.approval_request_id = NEW.id AND s.approver_role_id IS NOT NULL
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------- notify_po_status_change ----------
CREATE OR REPLACE FUNCTION public.notify_po_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'APPROVED' AND OLD.status != 'APPROVED' THEN
    INSERT INTO notifications (organization_id, recipient_user_id, type, title, message, entity_type, entity_id, link)
    SELECT
      NEW.organization_id,
      NEW.created_by,
      'PO_APPROVED',
      '✅ Purchase Order Disetujui: ' || COALESCE(NEW.po_number, NEW.id::text),
      'Purchase order Anda telah disetujui oleh approver.',
      'purchase_order',
      NEW.id,
      '/supply-chain/purchasing'
    WHERE NEW.created_by IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$function$;
