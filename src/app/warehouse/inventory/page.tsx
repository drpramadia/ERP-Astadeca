"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { formatNumber, formatDate, getBadgeTone, getExpiryStatus } from "@/lib/utils";
import Link from "next/link";

interface InventoryItem {
  id: string;
  quantity: number;
  quantity_kg?: number;
  status: string;
  received_at?: string;
  cost_price?: number;
  selling_price?: number;
  products: { name: string; sku: string; purchase_price?: number; selling_price?: number } | null;
  batches: { batch_number: string; expiry_date?: string; cost_price?: number } | null;
  cold_storages: { name: string; code: string } | null;
  storage_locations: { name: string; code: string } | null;
  units: { code: string } | null;
}

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [coldStorages, setColdStorages] = useState<{ id: string; name: string; code: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    coldStorageId: "",
    status: "",
    search: "",
  });

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
        .eq("is_active", true)
        .maybeSingle();

      if (!membership) return;
      setOrganizationId(membership.organization_id);

      const { data: csData } = await supabase
        .from("cold_storages")
        .select("id, name, code")
        .eq("organization_id", membership.organization_id)
        .eq("status", "ACTIVE");

      setColdStorages(csData || []);
    }
    init();
  }, []);

  useEffect(() => {
    async function fetchInventory() {
      if (!organizationId) return;
      setIsLoading(true);

      const supabase = createClient();
      let query = supabase
        .from("inventory")
        .select("id, quantity, quantity_kg, status, received_at, products(name, sku), batches(batch_number, expiry_date), cold_storages(name, code), storage_locations(name, code), units(code)")
        .eq("organization_id", organizationId)
        .eq("owner_type", "COMPANY")
        .order("created_at", { ascending: false });

      if (filters.coldStorageId) {
        query = query.eq("cold_storage_id", filters.coldStorageId);
      }
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      const { data } = await query;
      setInventory((data as unknown as InventoryItem[]) || []);
      
      // Also fetch inventory levels for pricing summary
      const { data: levelsData } = await supabase
        .from("inventory_levels")
        .select("*, products(purchase_price, selling_price)")
        .eq("organization_id", organizationId)
        .eq("owner_type", "COMPANY")
        .limit(100);
      setIsLoading(false);
    }
    fetchInventory();
  }, [organizationId, filters]);

  const filteredInventory = filters.search
    ? inventory.filter(item =>
        item.products?.name?.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.products?.sku?.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.batches?.batch_number?.toLowerCase().includes(filters.search.toLowerCase())
      )
    : inventory;

  const statusOptions = [
    { value: "", label: "Semua Status" },
    { value: "AVAILABLE", label: "Tersedia" },
    { value: "QUARANTINE", label: "Quarantine" },
    { value: "DAMAGED", label: "Rusak" },
    { value: "EXPIRED", label: "Kedaluwarsa" },
    { value: "BLOCKED", label: "Diblokir" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader
          eyebrow="GUDANG"
          title="Persediaan"
          description="Kelola dan pantau persediaan barang di cold storage."
          actions={
            <Link href="/warehouse/movements">
              <Button variant="secondary" size="sm">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Riwayat Movement
              </Button>
            </Link>
          }
        />

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-4">
          <Input
            placeholder="Cari SKU, nama produk, atau batch..."
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
            className="w-64"
          />
          <Select
            options={[{ value: "", label: "Semua Cold Storage" }, ...coldStorages.map(cs => ({ value: cs.id, label: `${cs.code} - ${cs.name}` }))]}
            value={filters.coldStorageId}
            onChange={(e) => setFilters(f => ({ ...f, coldStorageId: e.target.value }))}
            className="w-48"
          />
          <Select
            options={statusOptions}
            value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
            className="w-40"
          />
          <div className="ml-auto text-sm text-slate-500">
            {filteredInventory.length} item ditemukan
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">Memuat data...</p>
            </div>
          </div>
        ) : filteredInventory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-ink">Belum ada persediaan</h3>
            <p className="mt-2 text-sm text-slate-500">
              Persediaan akan muncul setelah ada penerimaan barang dari pembelian.
            </p>
            <Link href="/supply-chain/receiving">
              <Button variant="primary" className="mt-4">
                Proses Penerimaan
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Produk</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Batch</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">Lokasi</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Jumlah</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Harga Beli</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Harga Jual</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Margin</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Expiry</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filteredInventory.map((item) => {
                    const expiryTone = getExpiryStatus(item.batches?.expiry_date);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-ink">{item.products?.sku || "-"}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-ink">{item.products?.name || "-"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-ink">{item.batches?.batch_number || "-"}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-ink">{item.cold_storages?.code || "-"} / {item.storage_locations?.code || "-"}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-sm font-semibold text-ink">{formatNumber(Number(item.quantity_kg || item.quantity || 0))} {item.units?.code || "KG"}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-sm text-ink">
                            {item.cost_price || item.batches?.cost_price || item.products?.purchase_price
                              ? `Rp ${formatNumber(Number(item.cost_price || item.batches?.cost_price || item.products?.purchase_price || 0))}`
                              : "-"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-sm text-ink">
                            {item.selling_price || item.products?.selling_price
                              ? `Rp ${formatNumber(Number(item.selling_price || item.products?.selling_price || 0))}`
                              : "-"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {(() => {
                            const cost = Number(item.cost_price || item.batches?.cost_price || item.products?.purchase_price || 0);
                            const sell = Number(item.selling_price || item.products?.selling_price || 0);
                            const margin = sell - cost;
                            const pct = cost > 0 ? ((margin / cost) * 100).toFixed(1) : "0";
                            return (
                              <p className={`text-sm font-semibold ${margin >= 0 ? "text-success" : "text-danger"}`}>
                                {cost > 0 ? `Rp ${formatNumber(margin)} (${pct}%)` : "-"}
                              </p>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium ${expiryTone === "danger" ? "text-danger" : expiryTone === "warning" ? "text-warning" : "text-slate-500"}`}>
                            {item.batches?.expiry_date ? formatDate(item.batches.expiry_date) : "-"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge tone={getBadgeTone(item.status)}>{item.status}</StatusBadge>
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