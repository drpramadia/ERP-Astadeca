"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface ReceivingRecord {
  id: string;
  receiving_number: string;
  po_id?: string;
  supplier_id: string;
  received_date: string;
  status: string;
  notes?: string;
  suppliers?: { name: string; code: string };
  purchase_orders?: { po_number: string };
}

interface QcRecord {
  id: string;
  qc_number: string;
  receiving_id: string;
  batch_id: string;
  product_id: string;
  status: string;
  inspected_at: string;
  notes?: string;
  products?: { name: string; sku: string };
  batches?: { batch_number: string };
}

export default function ReceivingPage() {
  const [activeTab, setActiveTab] = useState<"receiving" | "qc">("receiving");
  const [receiving, setReceiving] = useState<ReceivingRecord[]>([]);
  const [qc, setQc] = useState<QcRecord[]>([]);
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
      const [receivingRes, qcRes] = await Promise.all([
        supabase
          .from("receiving_records")
          .select("*, suppliers(name, code), purchase_orders(po_number)")
          .eq("organization_id", membership.organization_id)
          .order("received_date", { ascending: false })
          .limit(50),
        supabase
          .from("qc_inspections")
          .select("*, products(name, sku), batches(batch_number)")
          .eq("organization_id", membership.organization_id)
          .order("inspected_at", { ascending: false })
          .limit(50),
      ]);

      setReceiving(receivingRes.data || []);
      setQc(qcRes.data || []);
      setIsLoading(false);
    }
    init();
  }, []);

  const receivingStatusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
    PENDING: { label: "Menunggu", tone: "warning" },
    PARTIAL: { label: "Sebagian", tone: "warning" },
    COMPLETED: { label: "Selesai", tone: "success" },
    CANCELLED: { label: "Dibatalkan", tone: "danger" },
  };

  const qcStatusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
    ACCEPTED: { label: "Diterima", tone: "success" },
    PARTIAL_ACCEPT: { label: "Terima Sebagian", tone: "warning" },
    QUARANTINE: { label: "Quarantine", tone: "danger" },
    REJECTED: { label: "Ditolak", tone: "danger" },
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SUPPLY CHAIN"
          title="Penerimaan & QC"
          description="Kelola penerimaan barang dan kendali mutu."
          actions={
            <Button variant="primary" size="sm">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Penerimaan Baru
            </Button>
          }
        />

        <div className="mb-6 flex items-center gap-4 border-b border-line">
          <button
            onClick={() => setActiveTab("receiving")}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "receiving"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            Penerimaan
          </button>
          <button
            onClick={() => setActiveTab("qc")}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === "qc"
                ? "border-b-2 border-primary text-primary"
                : "text-slate-500 hover:text-ink"
            }`}
          >
            Kendali Mutu
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : activeTab === "receiving" ? (
          receiving.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink">Belum ada penerimaan</h3>
              <p className="mt-2 text-sm text-slate-500">
                Penerimaan barang akan tercatat setelah PO diproses.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-white overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">PO Reference</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Supplier</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Tanggal</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {receiving.map((record) => {
                      const statusInfo = receivingStatusOptions[record.status] || { label: record.status, tone: "neutral" as const };
                      return (
                        <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{record.receiving_number}</td>
                          <td className="px-4 py-3 text-sm text-ink">{record.purchase_orders?.po_number || "-"}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-ink">{record.suppliers?.name || "-"}</p>
                            <p className="text-xs text-slate-500">{record.suppliers?.code || "-"}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">{formatDate(record.received_date)}</td>
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
        ) : qc.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada QC inspection</h3>
            <p className="mt-2 text-sm text-slate-500">
              QC inspection akan tercatat setelah penerimaan barang.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Produk</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Batch</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Tanggal</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {qc.map((record) => {
                    const statusInfo = qcStatusOptions[record.status] || { label: record.status, tone: "neutral" as const };
                    return (
                      <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-medium text-ink">{record.qc_number}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink">{record.products?.name || "-"}</p>
                          <p className="text-xs text-slate-500">{record.products?.sku || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-ink">{record.batches?.batch_number || "-"}</td>
                        <td className="px-4 py-3 text-sm text-ink">{formatDate(record.inspected_at)}</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button className="text-xs font-medium text-primary hover:underline">Lihat</button>
                          {record.status === "QUARANTINE" && (
                            <span className="mx-1 text-slate-300">|</span>
                          )}
                          {record.status === "QUARANTINE" && (
                            <button className="text-xs font-medium text-success hover:underline">Release</button>
                          )}
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