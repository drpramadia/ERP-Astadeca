"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatNumber } from "@/lib/utils";

interface RentalAllocation {
  id: string;
  allocation_number: string;
  active_quantity_kg: number;
  released_quantity_kg: number;
  status: string;
  contracts: { contract_number: string; title: string } | null;
  customers: { name: string } | null;
  products: { name: string; sku: string } | null;
  batches: { batch_number: string; expiry_date: string | null } | null;
  cold_storages: { code: string } | null;
  storage_locations: { code: string } | null;
}

const releaseReasons = [
  { value: "CUSTOMER_REQUEST", label: "Permintaan pelanggan" },
  { value: "CONTRACT_END", label: "Akhir kontrak" },
  { value: "QUALITY", label: "Kualitas" },
  { value: "OTHER", label: "Lainnya" },
];

export default function ReleasePage() {
  const [allocations, setAllocations] = useState<RentalAllocation[]>([]);
  const [actorId, setActorId] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getClaims();
        const userId = claimsData?.claims?.sub;
        if (!userId) throw new Error("Silakan login untuk mengakses pelepasan rental.");
        const { data: membership, error: membershipError } = await supabase
          .from("organization_memberships")
          .select("organization_id")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");

        const { data, error: allocationError } = await supabase
          .from("rental_allocations")
          .select("id, allocation_number, active_quantity_kg, released_quantity_kg, status, contracts:rental_contracts(contract_number, title), customers(name), products(name, sku), batches(batch_number, expiry_date), cold_storages(code), storage_locations(code)")
          .eq("organization_id", membership.organization_id)
          .in("status", ["ACTIVE", "PARTIALLY_RELEASED"])
          .order("allocated_at", { ascending: false });
        if (allocationError) throw allocationError;

        if (!cancelled) {
          setActorId(userId);
          setAllocations((data || []) as unknown as RentalAllocation[]);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat alokasi rental.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function release(allocation: RentalAllocation) {
    if (!actorId) return;
    const quantity = Number(quantities[allocation.id]);
    const reason = reasons[allocation.id];
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(allocation.active_quantity_kg)) {
      setError("Jumlah pelepasan harus lebih dari nol dan tidak melebihi sisa alokasi.");
      return;
    }
    if (!reason) {
      setError("Pilih alasan pelepasan.");
      return;
    }

    setActingId(allocation.id);
    setError(null);
    setSuccess(null);
    try {
      const supabase = createClient();
      const { data, error: releaseError } = await supabase.rpc("release_rental_stock", {
        p_allocation_id: allocation.id,
        p_quantity_kg: quantity,
        p_reason: reason,
        p_notes: notes[allocation.id] || null,
        p_performed_by: actorId,
        p_approval_request_id: null,
      });
      if (releaseError) throw releaseError;
      const result = data?.[0];
      if (!result?.success) throw new Error(result?.message || "Pelepasan tidak berhasil.");

      const remaining = Number(allocation.active_quantity_kg) - quantity;
      setAllocations((current) => current.map((item) => item.id === allocation.id
        ? { ...item, active_quantity_kg: remaining, released_quantity_kg: Number(item.released_quantity_kg) + quantity, status: remaining === 0 ? "RELEASED" : "PARTIALLY_RELEASED" }
        : item));
      setQuantities((current) => ({ ...current, [allocation.id]: "" }));
      setSuccess(`${allocation.allocation_number}: ${formatNumber(quantity)} KG dilepas; sisa ${formatNumber(remaining)} KG.`);
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "Gagal menyimpan pelepasan rental.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="COLD STORAGE RENTAL" title="Pelepasan Barang" description="Lepas seluruh atau sebagian stok customer-owned dari alokasi rental." />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>}
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-slate-500">Memuat alokasi rental...</div>
        ) : allocations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-white p-10 text-center text-sm text-slate-500">Tidak ada alokasi rental aktif untuk dilepas.</div>
        ) : (
          <div className="space-y-4">
            {allocations.map((allocation) => (
              <article key={allocation.id} className="rounded-xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">{allocation.allocation_number} · {allocation.contracts?.contract_number}</p>
                    <h2 className="mt-1 font-semibold text-ink">{allocation.products?.name || "Produk"} · {allocation.customers?.name || "Customer"}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Batch {allocation.batches?.batch_number || "-"} · Exp {allocation.batches?.expiry_date ? formatDate(allocation.batches.expiry_date) : "-"} · {allocation.cold_storages?.code}/{allocation.storage_locations?.code}
                    </p>
                  </div>
                  <StatusBadge tone={allocation.status === "ACTIVE" ? "success" : "warning"}>{allocation.status}</StatusBadge>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-4">
                  <div><p className="text-xs text-slate-500">Aktif</p><p className="mt-1 font-semibold">{formatNumber(Number(allocation.active_quantity_kg))} KG</p></div>
                  <div><p className="text-xs text-slate-500">Sudah dilepas</p><p className="mt-1 font-semibold">{formatNumber(Number(allocation.released_quantity_kg))} KG</p></div>
                  <Input
                    label="Jumlah (KG)"
                    type="number"
                    min="0.001"
                    max={allocation.active_quantity_kg}
                    step="0.001"
                    value={quantities[allocation.id] || ""}
                    onChange={(event) => setQuantities((current) => ({ ...current, [allocation.id]: event.target.value }))}
                  />
                  <Select
                    label="Alasan"
                    options={[{ value: "", label: "Pilih alasan" }, ...releaseReasons]}
                    value={reasons[allocation.id] || ""}
                    onChange={(event) => setReasons((current) => ({ ...current, [allocation.id]: event.target.value }))}
                  />
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <Textarea
                    label="Catatan"
                    rows={2}
                    value={notes[allocation.id] || ""}
                    onChange={(event) => setNotes((current) => ({ ...current, [allocation.id]: event.target.value }))}
                    className="sm:flex-1"
                  />
                  <Button loading={actingId === allocation.id} disabled={actingId !== null || allocation.status === "RELEASED"} onClick={() => void release(allocation)}>
                    Proses pelepasan
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
