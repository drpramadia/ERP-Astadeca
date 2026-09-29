-- Migration: 040_rental_billing.sql
-- Date: 2026-09-29
-- Rental billing: invoices from active contracts + rates

CREATE TABLE IF NOT EXISTS public.rental_billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contract_id uuid NOT NULL REFERENCES rental_contracts(id),
  invoice_number text NOT NULL,
  billing_period_start date NOT NULL,
  billing_period_end date NOT NULL,
  total_amount numeric(15,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED')),
  due_date date,
  notes text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rental_billing_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES rental_billing_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  qty numeric(15,3) DEFAULT 0,
  unit_price numeric(15,2) DEFAULT 0,
  line_total numeric(15,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE rental_billing_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_read ON rental_billing_invoices FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND is_active = true)
);
CREATE POLICY billing_insert ON rental_billing_invoices FOR INSERT WITH CHECK (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND is_active = true)
);
CREATE POLICY billing_update ON rental_billing_invoices FOR UPDATE USING (
  organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid() AND is_active = true)
);

ALTER TABLE rental_billing_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_items_read ON rental_billing_line_items FOR SELECT USING (true);
CREATE POLICY billing_items_insert ON rental_billing_line_items FOR INSERT WITH CHECK (true);

-- Seed INV sequence
INSERT INTO document_sequences (org_id, doc_type, next_value)
VALUES ('a4ae3325-7073-4a64-bd7c-045d591f5e29', 'INV', 1)
ON CONFLICT (org_id, doc_type) DO NOTHING;
