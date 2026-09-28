"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import { formatNumber, formatCurrency, formatDate } from "@/lib/utils";

interface RentalCharge {
  id: string;
  charge_number: string;
  billing_start: string;
  billing_end: string;
  quantity_kg_average: number;
  days_billed: number;
  rate_per_kg_day: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  contracts?: { contract_number: string; title: string };
  customers?: { name: string };
  products?: { name: string };
  cold_storages?: { name: string; code: string };
}

interface RentalInvoice {
  id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  status: string;
  contracts?: { contract_number: string; title: string };
  customers?: { name: string };
}

export default function RentalBillingPage() {
  const [activeTab, setActiveTab] = useState<"charges" | "invoices">("charges");
  const [charges, setCharges] = useState<RentalCharge[]>([]);
  const [invoices, setInvoices] = useState<RentalInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getClaims();
      const claims = claimsData?.claims;
      if (!claims) return;

      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", claims.sub)
        .eq("is_active", true)
        .maybeSingle();

      if (!membership) return;
      const [chargesRes, invoicesRes] = await Promise.all([
        supabase
          .from("rental_charges")
          .select("*, contracts(contract_number, title), customers(name), products(name), cold_storages(name, code)")
          .eq("organization_id", membership.organization_id)
          .order("billing_start", { ascending: false })
          .limit(50),
        supabase
          .from("rental_invoices")
          .select("*, contracts(contract_number, title), customers(name)")
          .eq("organization_id", membership.organization_id)
          .order("issue_date", { ascending: false })
          .limit(50),
      ]);

      setCharges(chargesRes.data || []);
      setInvoices(invoicesRes.data || []);
      setIsLoading(false);
    }
    init();
  }, []);

  const invoiceStatusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    ISSUED: { label: "Diterbitkan", tone: "info" },
    SENT: { label: "Terkirim", tone: "warning" },
    PARTIALLY_PAID: { label: "Sebagian", tone: "warning" },
    PAID: { label: "Lunas", tone: "success" },
    OVERDUE: { label: "Jatuh Tempo", tone: "danger" },
    CANCELLED: { label: "Dibatalkan", tone: "neutral" },
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="COLD STORAGE RENTAL"
          title="Penagihan"
          description="Riwayat tagihan dan invoice penyewaan cold storage."
        />

        <div className="mb-6 flex items-center gap-4 border-b border-line">
          <button
            onClick={() => setActiveTab("charges")}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "charges"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            Charge Ledger
          </button>
          <button
            onClick={() => setActiveTab("invoices")}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "invoices"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            Invoice
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : activeTab === "charges" ? (
          charges.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink">Belum ada charge</h3>
              <p className="mt-2 text-sm text-slate-500">
                Charge akan muncul setelah ada barang rental yang aktif.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Periode</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Qty Avg</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Hari</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Rate</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {charges.map((charge) => (
                      <tr key={charge.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono text-ink">{charge.charge_number}</td>
                        <td className="px-4 py-3 text-sm font-medium text-ink">{charge.customers?.name || "-"}</td>
                        <td className="px-4 py-3 text-sm text-ink">
                          {formatDate(charge.billing_start)} - {formatDate(charge.billing_end)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-ink">{formatNumber(charge.quantity_kg_average)} KG</td>
                        <td className="px-4 py-3 text-right text-sm text-ink">{charge.days_billed}</td>
                        <td className="px-4 py-3 text-right text-sm text-ink">{formatCurrency(charge.rate_per_kg_day)}/KG/hari</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-ink">{formatCurrency(charge.total_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={charge.status === "INVOICED" ? "success" : "warning"}>
                            {charge.status === "PENDING" ? "Tertunda" : charge.status === "INVOICED" ? "Difakturkan" : charge.status}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : invoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada invoice</h3>
            <p className="mt-2 text-sm text-slate-500">
              Invoice akan muncul setelah ada charge yang diinvoice.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor Invoice</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Periode</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Jatuh Tempo</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Dibayar</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {invoices.map((invoice) => {
                    const statusInfo = invoiceStatusOptions[invoice.status] || { label: invoice.status, tone: "neutral" as const };
                    return (
                      <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{invoice.invoice_number}</td>
                        <td className="px-4 py-3 text-sm font-medium text-ink">{invoice.customers?.name || "-"}</td>
                        <td className="px-4 py-3 text-sm text-ink">
                          {formatDate(invoice.billing_period_start)} - {formatDate(invoice.billing_period_end)}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{formatDate(invoice.due_date)}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-ink">{formatCurrency(invoice.total_amount)}</td>
                        <td className="px-4 py-3 text-right text-sm text-ink">{formatCurrency(invoice.amount_paid)}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}