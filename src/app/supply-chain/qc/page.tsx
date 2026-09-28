"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface QcRecord {
  id: string;
  qc_number: string;
  receiving_id: string | null;
  status: string | null;
  result: string | null;
  inspected_at: string | null;
  notes: string | null;
  created_at: string | null;
  receiving_records?: { receiving_number: string } | null;
}

const statusOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  ACCEPTED: { label: "Diterima", tone: "success" },
  PARTIAL_ACCEPT: { label: "Terima Sebagian", tone: "warning" },
  QUARANTINE: { label: "Quarantine", tone: "warning" },
  REJECTED: { label: "Ditolak", tone: "danger" },
  PASSED: { label: "Lulus", tone: "success" },
  FAILED: { label: "Gagal", tone: "danger" },
  PENDING: { label: "Menunggu", tone: "neutral" },
};

const resultOptions: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  PASS: { label: "Pass", tone: "success" },
  FAIL: { label: "Fail", tone: "danger" },
  CONDITIONAL: { label: "Bersyarat", tone: "warning" },
  HOLD: { label: "Hold", tone: "neutral" },
};

export default function QcPage() {
  const [qc, setQc] = useState<QcRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    const cancelled: boolean = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getClaims();
        const userId = claimsData?.claims?.sub;
        if (!userId) throw new Error("Silakan login untuk membuka kendali mutu.");

        const { data: membership, error: membershipError } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");

        const { data, error: qcError } = await supabase
          .from("qc_inspections")
          .select(`
            id, qc_number, receiving_id, status, result, inspected_at, notes, created_at,
            receiving_records(receiving_number)
          `)
          .eq("organization_id", membership.organization_id)
          .order("inspected_at", { ascending: false })
          .limit(200);

        if (qcError) throw qcError;
        if (!cancelled) {
          setQc((data || []) as unknown as QcRecord[]);
          setIsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Gagal memuat data QC.");
          setIsLoading(false);
        }
      }
    }
    void load();
  }, []);

  const filtered = statusFilter
    ? qc.filter((r) => r.status === statusFilter)
    : qc;

  const statusCounts = qc.reduce<Record<string, number>>((acc, r) => {
    if (r.status) acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="SUPPLY CHAIN"
          title="Kendali Mutu"
          description="Pemeriksaan kualitas barang saat penerimaan dan distribusi."
        />

        {/* Status summary */}
        {Object.keys(statusCounts).length > 0 && (
          <div className="mb-5 flex flex-wrap gap-3">
            <button
              onClick={() => setStatusFilter("")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === "" ? "border-primary bg-primary/10 text-primary" : "border-line bg-white text-slate-600 hover:border-slate-300"}`}
            >
              Semua ({qc.length})
            </button>
            {Object.entries(statusCounts).map(([status, count]) => {
              const info = statusOptions[status] || { label: status, tone: "neutral" as const };
              const toneClass = info.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : info.tone === "danger" ? "border-red-200 bg-red-50 text-red-700" : info.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700";
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(statusFilter === status ? "" : status)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${statusFilter === status ? "border-primary bg-primary/10 text-primary" : toneClass}`}
                >
                  {info.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">
            Memuat pemeriksaan kualitas...
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-12 text-center text-sm text-slate-500">
            {statusFilter ? `Tidak ada QC dengan status "${statusOptions[statusFilter]?.label || statusFilter}".` : "Belum ada pemeriksaan kualitas."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">QC Number</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Receiving</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Produk / Batch</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500">Quantity</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500">Hasil</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Tanggal</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {filtered.map((record) => {
                  const statusInfo = statusOptions[record.status || ""] || { label: record.status || "—", tone: "neutral" as const };
                  const resultInfo = resultOptions[record.result || ""] || { label: record.result || "—", tone: "neutral" as const };
                  return (
                    <tr key={record.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-medium text-ink">{record.qc_number || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{record.receiving_records?.receiving_number || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">—</td>
                      <td className="px-4 py-3 text-right text-slate-500">—</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={resultInfo.tone}>{resultInfo.label}</StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{record.inspected_at ? formatDate(record.inspected_at) : record.created_at ? formatDate(record.created_at) : "—"}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-slate-500">{record.notes || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
