"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";

interface SalesOrder {
  id: string;
  order_number: string;
  customer_id: string;
  status: string;
  order_date: string;
  due_date?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  customers?: { name: string; code: string };
}

interface Quotation {
  id: string;
  quotation_number: string;
  customer_id: string;
  status: string;
  quotation_date: string;
  valid_until?: string;
  total_amount: number;
  notes?: string;
  customers?: { name: string; code: string };
}

export default function SalesPage() {
  const [activeTab, setActiveTab] = useState<"orders" | "quotations">("orders");
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
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
      const [ordersRes, quotationsRes] = await Promise.all([
        supabase
          .from("sales_orders")
          .select("*, customers(name, code)")
          .eq("organization_id", membership.organization_id)
          .order("order_date", { ascending: false })
          .limit(50),
        supabase
          .from("quotations")
          .select("*, customers(name, code)")
          .eq("organization_id", membership.organization_id)
          .order("quotation_date", { ascending: false })
          .limit(50),
      ]);

      setOrders(ordersRes.data || []);
      setQuotations(quotationsRes.data || []);
      setIsLoading(false);
    }
    init();
  }, []);

  const statusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    SUBMITTED: { label: "Submitted", tone: "warning" },
    APPROVED: { label: "Disetujui", tone: "info" },
    CONFIRMED: { label: "Dikonfirmasi", tone: "info" },
    PROCESSING: { label: "Diproses", tone: "warning" },
    PICKING: { label: "Dipicking", tone: "warning" },
    SHIPPED: { label: "Dikirim", tone: "info" },
    DELIVERED: { label: "Diterima", tone: "success" },
    CANCELLED: { label: "Dibatalkan", tone: "danger" },
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SUPPLY CHAIN"
          title="Penjualan"
          description="Kelola quotation dan sales order."
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm">
                Quotation Baru
              </Button>
              <Button variant="primary" size="sm">
                Sales Order Baru
              </Button>
            </div>
          }
        />

        <div className="mb-6 flex items-center gap-4 border-b border-line">
          <button
            onClick={() => setActiveTab("orders")}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "orders"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            Sales Orders
          </button>
          <button
            onClick={() => setActiveTab("quotations")}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "quotations"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            Quotations
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : activeTab === "orders" ? (
          orders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink">Belum ada Sales Order</h3>
              <p className="mt-2 text-sm text-slate-500">Sales order akan muncul setelah dibuat.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor Order</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Tanggal</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {orders.map((order) => {
                      const statusInfo = statusOptions[order.status] || { label: order.status, tone: "neutral" as const };
                      return (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{order.order_number}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-ink">{order.customers?.name || "-"}</p>
                            <p className="text-xs text-slate-500">{order.customers?.code || "-"}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">{formatDate(order.order_date)}</td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-ink">{formatCurrency(Number(order.total_amount))}</td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button className="text-xs font-medium text-primary hover:underline">Lihat</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : quotations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada Quotation</h3>
            <p className="mt-2 text-sm text-slate-500">Quotation akan muncul setelah dibuat.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor Quotation</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Tanggal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Berlaku Sampai</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Total</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {quotations.map((quote) => {
                    const statusInfo = statusOptions[quote.status] || { label: quote.status, tone: "neutral" as const };
                    return (
                      <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{quote.quotation_number}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink">{quote.customers?.name || "-"}</p>
                          <p className="text-xs text-slate-500">{quote.customers?.code || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{formatDate(quote.quotation_date)}</td>
                        <td className="px-4 py-3 text-sm text-ink">{quote.valid_until ? formatDate(quote.valid_until) : "-"}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-ink">{formatCurrency(Number(quote.total_amount))}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button className="text-xs font-medium text-primary hover:underline">Lihat</button>
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