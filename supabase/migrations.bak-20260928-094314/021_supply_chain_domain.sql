-- Migration: 021_supply_chain_domain.sql
-- Supply chain tables (clean version - tables + RLS + indexes, no FK blocks)
-- Date: 2026-09-27

CREATE TABLE IF NOT EXISTS public.purchase_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    pr_number text,
    supplier_id uuid,
    requester_id uuid,
    status text DEFAULT 'DRAFT',
    request_date date DEFAULT CURRENT_DATE,
    needed_date date,
    notes text,
    approval_request_id uuid,
    approved_by uuid,
    approved_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_request_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id uuid,
    product_id uuid,
    quantity numeric(14,3) DEFAULT 0,
    unit_id uuid,
    requested_price numeric(16,2),
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    po_number text,
    supplier_id uuid,
    status text DEFAULT 'DRAFT',
    order_date date DEFAULT CURRENT_DATE,
    expected_date date,
    subtotal numeric(16,2) DEFAULT 0,
    tax_percentage numeric(5,2) DEFAULT 0,
    tax_amount numeric(16,2) DEFAULT 0,
    discount_percentage numeric(5,2) DEFAULT 0,
    discount_amount numeric(16,2) DEFAULT 0,
    total_amount numeric(16,2) DEFAULT 0,
    payment_terms_days integer DEFAULT 0,
    notes text,
    approval_request_id uuid,
    approved_by uuid,
    approved_at timestamptz,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id uuid,
    product_id uuid,
    quantity numeric(14,3) DEFAULT 0,
    unit_id uuid,
    unit_price numeric(16,2),
    received_quantity numeric(14,3) DEFAULT 0,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.receiving_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    receiving_number text,
    po_id uuid,
    supplier_id uuid,
    status text DEFAULT 'PENDING',
    received_date date DEFAULT CURRENT_DATE,
    notes text,
    approved_by uuid,
    approved_at timestamptz,
    created_by uuid,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.receiving_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receiving_id uuid,
    po_item_id uuid,
    product_id uuid,
    batch_number text,
    quantity numeric(14,3) DEFAULT 0,
    actual_quantity numeric(14,3) DEFAULT 0,
    unit_id uuid,
    cold_storage_id uuid,
    storage_location_id uuid,
    production_date date,
    expiry_date date,
    qc_status text DEFAULT 'PENDING',
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qc_inspections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    receiving_id uuid,
    qc_number text,
    status text DEFAULT 'PENDING',
    result text,
    inspector_id uuid,
    inspected_at timestamptz,
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    so_number text,
    customer_id uuid,
    status text DEFAULT 'DRAFT',
    order_date date DEFAULT CURRENT_DATE,
    delivery_date date,
    subtotal numeric(16,2) DEFAULT 0,
    tax_percentage numeric(5,2) DEFAULT 0,
    tax_amount numeric(16,2) DEFAULT 0,
    discount_percentage numeric(5,2) DEFAULT 0,
    discount_amount numeric(16,2) DEFAULT 0,
    total_amount numeric(16,2) DEFAULT 0,
    payment_terms_days integer DEFAULT 0,
    notes text,
    approval_request_id uuid,
    approved_by uuid,
    approved_at timestamptz,
    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    so_id uuid,
    product_id uuid,
    quantity numeric(14,3) DEFAULT 0,
    unit_id uuid,
    unit_price numeric(16,2),
    discount_percentage numeric(5,2) DEFAULT 0,
    subtotal numeric(16,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.quotations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    quotation_number text,
    customer_id uuid,
    status text DEFAULT 'DRAFT',
    quotation_date date DEFAULT CURRENT_DATE,
    valid_until date,
    notes text,
    created_by uuid,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id uuid,
    product_id uuid,
    quantity numeric(14,3) DEFAULT 0,
    unit_id uuid,
    unit_price numeric(16,2)
);

CREATE TABLE IF NOT EXISTS public.delivery_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    do_number text,
    sales_order_id uuid,
    customer_id uuid,
    status text DEFAULT 'DRAFT',
    delivery_date date,
    vehicle_number text,
    driver_name text,
    recipient_name text,
    recipient_address text,
    pod_received_at timestamptz,
    pod_recipient_signature text,
    pod_notes text,
    notes text,
    created_by uuid,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id uuid,
    product_id uuid,
    batch_number text,
    quantity_ordered numeric(14,3) DEFAULT 0,
    quantity_delivered numeric(14,3) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.returns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid,
    return_number text,
    return_type text DEFAULT 'CUSTOMER',
    reference_type text,
    reference_id uuid,
    customer_id uuid,
    supplier_id uuid,
    status text DEFAULT 'PENDING',
    reason text,
    notes text,
    created_by uuid,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.return_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id uuid,
    product_id uuid,
    batch_number text,
    quantity numeric(14,3) DEFAULT 0,
    quantity_returned numeric(14,3) DEFAULT 0
);

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY pr_all ON public.purchase_requests FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY pri_all ON public.purchase_request_items FOR ALL USING (public.is_org_member((SELECT organization_id FROM public.purchase_requests WHERE id = pr_id)));
CREATE POLICY po_all ON public.purchase_orders FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY poi_all ON public.purchase_order_items FOR ALL USING (public.is_org_member((SELECT organization_id FROM public.purchase_orders WHERE id = po_id)));
CREATE POLICY rr_all ON public.receiving_records FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY ri_all ON public.receiving_items FOR ALL USING (public.is_org_member((SELECT organization_id FROM public.receiving_records WHERE id = receiving_id)));
CREATE POLICY qi_all ON public.qc_inspections FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY so_all ON public.sales_orders FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY soi_all ON public.sales_order_items FOR ALL USING (public.is_org_member((SELECT organization_id FROM public.sales_orders WHERE id = so_id)));
CREATE POLICY qt_all ON public.quotations FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY qti_all ON public.quotation_items FOR ALL USING (public.is_org_member((SELECT organization_id FROM public.quotations WHERE id = quotation_id)));
CREATE POLICY dor_all ON public.delivery_orders FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY dori_all ON public.delivery_order_items FOR ALL USING (public.is_org_member((SELECT organization_id FROM public.delivery_orders WHERE id = delivery_id)));
CREATE POLICY ret_all ON public.returns FOR ALL USING (public.is_org_member(organization_id));
CREATE POLICY reti_all ON public.return_items FOR ALL USING (public.is_org_member((SELECT organization_id FROM public.returns WHERE id = return_id)));

CREATE INDEX IF NOT EXISTS idx_pr_org ON public.purchase_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_pr_number ON public.purchase_requests(pr_number);
CREATE INDEX IF NOT EXISTS idx_pr_status ON public.purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_po_org ON public.purchase_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_po_number ON public.purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_created_by ON public.purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON public.purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_rr_org ON public.receiving_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_rr_number ON public.receiving_records(receiving_number);
CREATE INDEX IF NOT EXISTS idx_rr_status ON public.receiving_records(status);
CREATE INDEX IF NOT EXISTS idx_rr_po ON public.receiving_records(po_id);
CREATE INDEX IF NOT EXISTS idx_ri_receiving ON public.receiving_items(receiving_id);
CREATE INDEX IF NOT EXISTS idx_qi_org ON public.qc_inspections(organization_id);
CREATE INDEX IF NOT EXISTS idx_qi_status ON public.qc_inspections(status);
CREATE INDEX IF NOT EXISTS idx_so_org ON public.sales_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_so_number ON public.sales_orders(so_number);
CREATE INDEX IF NOT EXISTS idx_so_status ON public.sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_so_customer ON public.sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_soi_so ON public.sales_order_items(so_id);
CREATE INDEX IF NOT EXISTS idx_dor_org ON public.delivery_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_dor_number ON public.delivery_orders(do_number);
CREATE INDEX IF NOT EXISTS idx_dor_status ON public.delivery_orders(status);
CREATE INDEX IF NOT EXISTS idx_dor_so ON public.delivery_orders(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_ret_org ON public.returns(organization_id);
CREATE INDEX IF NOT EXISTS idx_ret_number ON public.returns(return_number);
CREATE INDEX IF NOT EXISTS idx_ret_status ON public.returns(status);
CREATE INDEX IF NOT EXISTS idx_qt_org ON public.quotations(organization_id);
CREATE INDEX IF NOT EXISTS idx_qt_number ON public.quotations(quotation_number);
CREATE INDEX IF NOT EXISTS idx_qt_status ON public.quotations(status);
