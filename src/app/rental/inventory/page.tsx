"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/utils";

interface RentalAllocation {
  id: string;
  allocation_number: string;
  allocated_quantity: number;
  allocated_quantity_kg: number;
  active_quantity_kg: number;
  released_quantity_kg: number;
  status: string;
  allocated_at: string;
  released_at?: string;
  contracts?: { contract_number: string; title: string };
  customers?: { name: string };
  products?: { name: string; sku: string };
  cold_storages?: { name: string; code: string };
  storage_locations?: { name: string; code: string };
  batches?: { batch_number: string };
}

export default function RentalInventoryPage() {
  const [inventory, setInventory] = useState<RentalAllocation[]>([]);
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
        .from("rental_allocations")
        .select("*, contracts(contract_number, title), customers(name), products(name, sku), cold_storages(name, code), storage_locations(name, code), batches(batch_number)")
        .eq("organization_id", membership.organization_id)
        .order("allocated_at", { ascending: false });

      setInventory(data || []);
      setIsLoading(false);
    }
    init();
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="COLD STORAGE RENTAL"
          title="Persediaan Rental"
          description="Barang milik customer yang disimpan di cold storage."
        />

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : inventory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada barang rental</h3>
            <p className="mt-2 text-sm text-slate-500">
              Barang customer akan muncul setelah ada penerimaan rental.
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
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Produk</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Lokasi</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Diterima</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Dikeluarkan</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Sisa</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {inventory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-mono font-medium text-ink">{item.allocation_number}</p>
                        <p className="text-xs text-slate-500">{item.contracts?.contract_number}</p>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-ink">{item.customers?.name || "-"}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-ink">{item.products?.name || "-"}</p>
                        <p className="text-xs text-slate-500">{item.products?.sku || "-"}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink">
                        {item.cold_storages?.code || "-"} / {item.storage_locations?.code || "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-ink">
                        {formatNumber(Number(item.allocated_quantity_kg || 0))} KG
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-ink">
                        {formatNumber(Number(item.released_quantity_kg || 0))} KG
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-ink">
                        {formatNumber(Number(item.active_quantity_kg || 0))} KG
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge tone={item.status === "ACTIVE" ? "success" : item.status === "PARTIALLY_RELEASED" ? "warning" : "neutral"}>
                          {item.status === "ACTIVE" ? "Aktif" : item.status === "PARTIALLY_RELEASED" ? "Partial" : item.status}
                        </StatusBadge>
                      </td>
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