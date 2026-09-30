"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatNumber, formatDateTime } from "@/lib/utils";

interface Movement {
  id: string;
  movement_number: string;
  movement_type: string;
  quantity: number;
  quantity_kg?: number;
  reference_number?: string;
  performed_at: string;
  notes?: string;
  products: { name: string; sku: string } | null;
  batches: { batch_number: string } | null;
  profiles: { full_name?: string } | null;
}

const typeLabels: Record<string, string> = {
  RECEIVE: "Penerimaan",
  ISSUE: "Pengeluaran",
  TRANSFER_OUT: "Transfer Keluar",
  TRANSFER_IN: "Transfer Masuk",
  ADJUSTMENT: "Penyesuaian",
  RETURN: "Retur",
  DAMAGE: "Kerusakan",
  EXPIRY: "Kedaluwarsa",
};

const typeColors: Record<string, string> = {
  RECEIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ISSUE: "bg-rose-50 text-rose-700 border-rose-200",
  TRANSFER_OUT: "bg-amber-50 text-amber-700 border-amber-200",
  TRANSFER_IN: "bg-blue-50 text-blue-700 border-blue-200",
  ADJUSTMENT: "bg-purple-50 text-purple-700 border-purple-200",
  RETURN: "bg-orange-50 text-orange-700 border-orange-200",
  DAMAGE: "bg-red-50 text-red-700 border-red-200",
  EXPIRY: "bg-slate-100 text-slate-700 border-slate-200",
};

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("is_active", "true")
        .maybeSingle();

      if (!membership) return;
      setOrganizationId(membership.organization_id);
    }
    init();
  }, []);

  useEffect(() => {
    async function fetchMovements() {
      if (!organizationId) return;
      setIsLoading(true);

      const supabase = createClient();
      let query = supabase
        .from("inventory_movements")
        .select("id, movement_number, movement_type, quantity, quantity_kg, reference_number, performed_at, notes, products(name, sku), batches(batch_number), profiles!movements_performed_by_fkey(full_name)")
        .eq("organization_id", organizationId)
        .order("performed_at", { ascending: false })
        .limit(100);

      if (filter) {
        query = query.eq("movement_type", filter);
      }

      const { data } = await query;
      setMovements((data as unknown as Movement[]) || []);
      setIsLoading(false);
    }
    fetchMovements();
  }, [organizationId, filter]);

  const typeOptions = [
    { value: "", label: "Semua Tipe" },
    { value: "RECEIVE", label: "Penerimaan" },
    { value: "ISSUE", label: "Pengeluaran" },
    { value: "TRANSFER_OUT", label: "Transfer Keluar" },
    { value: "TRANSFER_IN", label: "Transfer Masuk" },
    { value: "ADJUSTMENT", label: "Penyesuaian" },
    { value: "RETURN", label: "Retur" },
    { value: "DAMAGE", label: "Kerusakan" },
    { value: "EXPIRY", label: "Kedaluwarsa" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="GUDANG"
          title="Riwayat Movement"
          description="Ledger immutabel semua perubahan persediaan."
        />

        <div className="mb-4 flex items-center justify-between">
          <Select
            options={typeOptions}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-48"
          />
          <div className="text-sm text-slate-500">
            {movements.length} movement ditemukan
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : movements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada movement</h3>
            <p className="mt-2 text-sm text-slate-500">
              Movement akan tercatat setelah ada transaksi persediaan.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Nomor</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Tipe</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Produk</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Batch</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Jumlah</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Referensi</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Petugas</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Waktu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {movements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-ink">{m.movement_number}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${typeColors[m.movement_type] || "bg-slate-100 text-slate-700"}`}>
                          {typeLabels[m.movement_type] || m.movement_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-ink">{m.products?.name || "-"}</p>
                        <p className="text-xs text-slate-500">{m.products?.sku || "-"}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink">{m.batches?.batch_number || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-sm font-semibold text-ink">{formatNumber(Number(m.quantity_kg || m.quantity || 0))} KG</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{m.reference_number || "-"}</td>
                      <td className="px-4 py-3 text-sm text-ink">{m.profiles?.full_name || "-"}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDateTime(m.performed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}