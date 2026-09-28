"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface DeliveryOrder {
  id: string;
  do_number: string;
  sales_order_id?: string;
  customer_id: string;
  status: string;
  scheduled_date?: string;
  shipped_date?: string;
  delivered_date?: string;
  recipient_name?: string;
  recipient_signature_url?: string;
  notes?: string;
  customers?: { name: string; code: string };
  sales_orders?: { order_number: string };
}

export default function DeliveryPage() {
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
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
      const { data } = await supabase
        .from("delivery_orders")
        .select("*, customers(name, code), sales_orders(order_number)")
        .eq("organization_id", membership.organization_id)
        .order("scheduled_date", { ascending: false })
        .limit(50);

      setDeliveries(data || []);
      setIsLoading(false);
    }
    init();
  }, []);

  const statusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
    DRAFT: { label: "Draft", tone: "neutral" },
    READY: { label: "Siap", tone: "warning" },
    IN_TRANSIT: { label: "Perjalanan", tone: "info" },
    DELIVERED: { label: "Diterima", tone: "success" },
    FAILED: { label: "Gagal", tone: "danger" },
    CANCELLED: { label: "Dibatalkan", tone: "neutral" },
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SUPPLY CHAIN"
          title="Pengiriman"
          description="Kelola delivery order dantracking pengiriman."
          actions={
            <Button variant="primary" size="sm">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Delivery Order Baru
            </Button>
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : deliveries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada delivery order</h3>
            <p className="mt-2 text-sm text-slate-500">
              Delivery order akan muncul setelah ada penjualan yang siap dikirim.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor DO</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Sales Order</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Jadwal</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Penerima</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {deliveries.map((delivery) => {
                    const statusInfo = statusOptions[delivery.status] || { label: delivery.status, tone: "neutral" as const };
                    return (
                      <tr key={delivery.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{delivery.do_number}</td>
                        <td className="px-4 py-3 text-sm text-ink">{delivery.sales_orders?.order_number || "-"}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink">{delivery.customers?.name || "-"}</p>
                          <p className="text-xs text-slate-500">{delivery.customers?.code || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">
                          {delivery.scheduled_date ? formatDate(delivery.scheduled_date) : "-"}
                          {delivery.delivered_date && <br />}
                          {delivery.delivered_date && <span className="text-xs text-slate-500">Diterima: {formatDate(delivery.delivered_date)}</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{delivery.recipient_name || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button className="text-xs font-medium text-primary hover:underline">Lihat</button>
                            {delivery.status === "READY" && (
                              <button className="text-xs font-medium text-success hover:underline">Kirim</button>
                            )}
                          </div>
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