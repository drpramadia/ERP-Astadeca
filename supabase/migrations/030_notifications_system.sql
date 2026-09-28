-- Migration: 030_notifications_system.sql
-- Real-time notifications for ASTADECA WMS
-- User-to-user notifications via Supabase Realtime + Database
-- Date: 2026-09-28

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'INFO',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    entity_type VARCHAR(50),
    entity_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own notifications
CREATE POLICY notifications_recipient_select
    ON public.notifications
    FOR SELECT
    USING (
        recipient_user_id = auth.uid()
        OR public.is_super_user(auth.uid())
    );

CREATE POLICY notifications_recipient_update
    ON public.notifications
    FOR UPDATE
    USING (recipient_user_id = auth.uid());

CREATE POLICY notifications_insert
    ON public.notifications
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- System can insert for any user (used by triggers/RPCs)
CREATE POLICY notifications_system_insert
    ON public.notifications
    FOR INSERT
    WITH CHECK (true);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON public.notifications(recipient_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org
    ON public.notifications(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
    ON public.notifications(recipient_user_id, is_read) WHERE is_read = false;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Send a notification to a user
CREATE OR REPLACE FUNCTION public.send_notification(
    p_organization_id UUID,
    p_recipient_user_id UUID,
    p_sender_user_id UUID DEFAULT NULL,
    p_type VARCHAR DEFAULT 'INFO',
    p_title TEXT,
    p_message TEXT,
    p_link TEXT DEFAULT NULL,
    p_entity_type VARCHAR(50) DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    -- Permission check: sender must be org member (or system)
    IF p_sender_user_id IS NOT NULL THEN
        IF NOT public.is_org_member_by_id(p_sender_user_id, p_organization_id) THEN
            RAISE EXCEPTION 'Sender is not an organization member';
        END IF;
    END IF;

    -- Cannot notify yourself (unless system)
    IF p_recipient_user_id = p_sender_user_id AND p_sender_user_id IS NOT NULL THEN
        -- Silently skip self-notifications for most types
        RETURN NULL;
    END IF;

    INSERT INTO public.notifications (
        organization_id, recipient_user_id, sender_user_id, type,
        title, message, link, entity_type, entity_id, metadata
    ) VALUES (
        p_organization_id, p_recipient_user_id, p_sender_user_id, p_type,
        p_title, p_message, p_link, p_entity_type, p_entity_id, p_metadata
    ) RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$;

-- Notify all users with a specific permission in an org
CREATE OR REPLACE FUNCTION public.notify_org_permission_holders(
    p_organization_id UUID,
    p_permission_code TEXT,
    p_sender_user_id UUID DEFAULT NULL,
    p_type VARCHAR DEFAULT 'INFO',
    p_title TEXT,
    p_message TEXT,
    p_link TEXT DEFAULT NULL,
    p_entity_type VARCHAR(50) DEFAULT NULL,
    p_entity_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_recipient RECORD;
BEGIN
    FOR v_recipient IN
        SELECT DISTINCT om.user_id
        FROM public.organization_memberships om
        JOIN public.roles r ON r.id = om.role_id
        JOIN public.role_permissions rp ON rp.role_id = r.id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE om.organization_id = p_organization_id
          AND om.is_active = true
          AND om.user_id IS DISTINCT FROM p_sender_user_id
          AND (p.code = p_permission_code OR r.code = 'DIRECTOR')
    LOOP
        PERFORM public.send_notification(
            p_organization_id, v_recipient.user_id, p_sender_user_id,
            p_type, p_title, p_message, p_link, p_entity_type, p_entity_id
        );
    END LOOP;
END;
$$;

-- Mark notification(s) as read
CREATE OR REPLACE FUNCTION public.mark_notification_read(
    p_notification_id UUID DEFAULT NULL,
    p_all BOOLEAN DEFAULT false,
    p_recipient_user_id UUID DEFAULT auth.uid()
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    IF p_all THEN
        UPDATE public.notifications
        SET is_read = true, read_at = now()
        WHERE recipient_user_id = p_recipient_user_id
          AND is_read = false;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSIF p_notification_id IS NOT NULL THEN
        UPDATE public.notifications
        SET is_read = true, read_at = now()
        WHERE id = p_notification_id
          AND recipient_user_id = p_recipient_user_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSE
        v_count := 0;
    END IF;

    RETURN v_count;
END;
$$;

-- ============================================================
-- TRIGGER: Auto-notify on approval requests
-- ============================================================
CREATE OR REPLACE FUNCTION public.notification_on_approval_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Notify org directors about new approval request
        PERFORM public.notify_org_permission_holders(
            NEW.organization_id,
            'approval.approve',
            NEW.requested_by,
            'WARNING',
            'Permintaan Persetujuan Baru',
            'Ada permintaan persetujuan baru yang menunggu: ' || COALESCE(NEW.entity_type, 'dokumen'),
            '/approval',
            'approval_request',
            NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_on_approval_request ON public.approval_requests;
CREATE TRIGGER trg_notification_on_approval_request
    AFTER INSERT ON public.approval_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.notification_on_approval_request();

-- ============================================================
-- TRIGGER: Notify on PO/GR/SO status changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.notification_on_document_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
    IF NEW.status = 'PENDING_APPROVAL' AND OLD.status IN ('DRAFT', 'SUBMITTED') THEN
        PERFORM public.notify_org_permission_holders(
            NEW.organization_id,
            'approval.approve',
            auth.uid(),
            'WARNING',
            'Dokumen Menunggu Persetujuan',
            'Dokumen ' || COALESCE(NEW.po_number, NEW.pr_number, NEW.so_number, '') ||
            ' membutuhkan persetujuan Anda',
            '/approval',
            COALESCE(NEW.po_number, NEW.pr_number, NEW.so_number, 'document'),
            NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Apply to purchase_orders
DROP TRIGGER IF EXISTS trg_notification_po_status ON public.purchase_orders;
CREATE TRIGGER trg_notification_po_status
    AFTER UPDATE ON public.purchase_orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.notification_on_document_status_change();

-- Apply to sales_orders
DROP TRIGGER IF EXISTS trg_notification_so_status ON public.sales_orders;
CREATE TRIGGER trg_notification_so_status
    AFTER UPDATE ON public.sales_orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.notification_on_document_status_change();

-- ============================================================
-- TRIGGER: Notify on inventory alerts (low stock / expiring)
-- ============================================================
CREATE OR REPLACE FUNCTION public.notification_on_inventory_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
    -- Expiring batch alert (set expiry_date to within 7 days)
    IF NEW.expiry_date IS NOT NULL
       AND NEW.expiry_date <= CURRENT_DATE + INTERVAL '7 days'
       AND (OLD.expiry_date IS NULL OR OLD.expiry_date > CURRENT_DATE + INTERVAL '7 days')
    THEN
        PERFORM public.notify_org_permission_holders(
            NEW.organization_id,
            'inventory.manage',
            NULL,
            'WARNING',
            'Batch Kedaluwarsa Mendatang',
            'Batch ' || COALESCE(NEW.batch_number, NEW.id::text) ||
            ' akan kedaluwarsa pada ' || TO_CHAR(NEW.expiry_date, 'DD Mon YYYY'),
            '/warehouse/inventory',
            'batch',
            NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_inventory_alert ON public.batches;
CREATE TRIGGER trg_notification_inventory_alert
    AFTER UPDATE ON public.batches
    FOR EACH ROW
    WHEN (NEW.status = 'ACTIVE')
    EXECUTE FUNCTION public.notification_on_inventory_alert();

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT EXECUTE ON FUNCTION public.send_notification TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_org_permission_holders TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_on_approval_request TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_on_document_status_change TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_on_inventory_alert TO authenticated;
