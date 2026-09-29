"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatNumber } from "@/lib/utils";

interface InventoryOption {
  id: string;
  quantity: number;
  quantity_kg: number | null;
  status: string;
  products: { name: string; sku: string } | null;
  batches: { batch_number: string } | null;
  cold_storages: { code: string } | null;
  storage_locations: { code: string } | null;
  units: { code: string } | null;
}

interface Adjustment {
  id: string;
  adjustment_number: string;
  adjustment_type: string;
  reason: string;
  status: string;
  notes: string | null;
  created_at: string;
  stock_adjustment_items: Array<{
    current_quantity: number;
    adjusted_quantity: number;
    variance_quantity: number;
    current_quantity_kg: number | null;
    adjusted_quantity_kg: number | null;
    products: { name: string; sku: string } | null;
  }>;
}

const reasons = ["DAMAGE", "EXPIRY", "WEIGHT_LOSS", "COUNT_DIFFERENCE", "SYSTEM_CORRECTION", "OTHER"];

export default function AdjustmentsPage() {
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [inventoryId, setInventoryId] = useState("");
  const [adjustedQuantity, setAdjustedQuantity] = useState("");
  const [adjustedQuantityKg, setAdjustedQuantityKg] = useState("");
  const [reason, setReason] = useState("COUNT_DIFFERENCE");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(orgId: string, userId: string) {
    const supabase = createClient();
    const [inventoryResult, adjustmentResult] = await Promise.all([
      supabase.from("inventory").select("id, quantity, quantity_kg, status, products(name, sku), batches(batch_number), cold_storages(code), storage_locations(code), units(code)").eq("organization_id", orgId).eq("owner_type", "COMPANY").eq("owner_id", orgId).neq("status", "BLOCKED").order("created_at", { ascending: false }),
      supabase.from("stock_adjustments").select("id, adjustment_number, adjustment_type, reason, status, notes, created_at, stock_adjustment_items(current_quantity, adjusted_quantity, variance_quantity, current_quantity_kg, adjusted_quantity_kg, products!adj_items_product_id_fkey(name, sku))").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (inventoryResult.error) throw inventoryResult.error;
    if (adjustmentResult.error) throw adjustmentResult.error;
    setOrganizationId(orgId);
    setActorId(userId);
    setInventory((inventoryResult.data || []) as unknown as InventoryOption[]);
    setAdjustments((adjustmentResult.data || []) as unknown as Adjustment[]);
  }

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const supabase = createClient();
        const { data: claimsData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) throw new Error("Silakan login untuk mengelola adjustment.");
        const { data: membership, error: membershipError } = await supabase.from("organization_memberships").select("organization_id").eq("user_id", userId).eq("is_active", true).maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) throw new Error("Akun belum memiliki organisasi aktif.");
        await load(membership.organization_id, userId);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Gagal memuat adjustment.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const selectedInventory = inventory.find((item) => item.id === inventoryId);

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationId || !actorId || !selectedInventory) return;
    const quantity = Number(adjustedQuantity);
    const quantityKg = adjustedQuantityKg === "" ? null : Number(adjustedQuantityKg);
    if (!Number.isFinite(quantity) || quantity < 0 || (quantityKg !== null && (!Number.isFinite(quantityKg) || quantityKg < 0))) {
      setError("Jumlah penyesuaian tidak valid atau negatif.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { data: adjustmentId, error: createError } = await createClient().rpc("create_stock_adjustment", {
        p_organization_id: organizationId,
        p_inventory_id: selectedInventory.id,
        p_adjusted_quantity: quantity,
        p_adjusted_quantity_kg: quantityKg,
        p_reason: reason,
        p_notes: notes || null,
        p_performed_by: actorId,
      });
      if (createError) throw createError;
      const { error: submitError } = await createClient().rpc("submit_stock_adjustment", { p_adjustment_id: adjustmentId, p_performed_by: actorId });
      if (submitError) throw submitError;
      setMessage("Adjustment dikirim untuk persetujuan Director. Stok belum berubah.");
      setInventoryId("");
      setAdjustedQuantity("");
      setAdjustedQuantityKg("");
      setNotes("");
      await load(organizationId, actorId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Gagal membuat adjustment.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <PageHeader eyebrow="GUDANG" title="Stock Adjustment" description="Perubahan inventory memerlukan approval Director dan menghasilkan movement ledger saat disetujui." />
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        <form onSubmit={(event) => void createDraft(event)} className="grid gap-4 border-b border-line pb-6 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Inventory item" required options={[{ value: "", label: "Pilih stok" }, ...inventory.map((item) => ({ value: item.id, label: `${item.products?.sku || ""} ${item.products?.name || ""} · ${item.batches?.batch_number || "-"} · ${item.cold_storages?.code || "-"}/${item.storage_locations?.code || "-"}` }))]} value={inventoryId} onChange={(event) => { const item = inventory.find((entry) => entry.id === event.target.value); setInventoryId(event.target.value); setAdjustedQuantity(item ? String(item.quantity) : ""); setAdjustedQuantityKg(item?.quantity_kg === null || item?.quantity_kg === undefined ? "" : String(item.quantity_kg)); }} disabled={isLoading} />
          <Select label="Reason" required options={reasons.map((item) => ({ value: item, label: item }))} value={reason} onChange={(event) => setReason(event.target.value)} />
          <Input label={`Jumlah baru (${selectedInventory?.units?.code || "unit"})`} required type="number" min="0" step="0.001" value={adjustedQuantity} onChange={(event) => setAdjustedQuantity(event.target.value)} disabled={!inventoryId} />
          <Input label="Berat baru (KG)" type="number" min="0" step="0.001" value={adjustedQuantityKg} onChange={(event) => setAdjustedQuantityKg(event.target.value)} disabled={!inventoryId} />
          <div className="sm:col-span-2 xl:col-span-3"><Textarea label="Catatan" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
          <div className="flex items-end"><Button type="submit" loading={isSaving} disabled={isLoading || !inventoryId}>Kirim untuk approval</Button></div>
        </form>
        {selectedInventory && <p className="mt-3 text-sm text-slate-500">Saat ini: {formatNumber(Number(selectedInventory.quantity))} {selectedInventory.units?.code || "unit"} · {formatNumber(Number(selectedInventory.quantity_kg || 0))} KG · status {selectedInventory.status}</p>}
        <section className="mt-7"><div className="mb-3"><h2 className="font-semibold text-ink">Adjustment terbaru</h2><p className="text-sm text-slate-500">Approved saja yang mengubah saldo inventory.</p></div>{isLoading ? <div className="py-8 text-center text-sm text-slate-500">Memuat adjustment...</div> : adjustments.length === 0 ? <div className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-slate-500">Belum ada adjustment.</div> : <div className="overflow-x-auto rounded-xl border border-line bg-white"><table className="w-full min-w-[760px]"><thead><tr className="border-b border-line bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600"><th className="px-4 py-3">Nomor</th><th className="px-4 py-3">Produk</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3 text-right">Selisih</th><th className="px-4 py-3">Dibuat</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-line">{adjustments.map((item) => <tr key={item.id}><td className="px-4 py-3 font-mono text-sm">{item.adjustment_number}</td><td className="px-4 py-3 text-sm">{item.stock_adjustment_items?.[0]?.products?.name || "-"}</td><td className="px-4 py-3 text-sm">{item.reason}</td><td className="px-4 py-3 text-right text-sm">{formatNumber(Number(item.stock_adjustment_items?.[0]?.variance_quantity || 0))}</td><td className="px-4 py-3 text-sm">{formatDateTime(item.created_at)}</td><td className="px-4 py-3"><StatusBadge tone={item.status === "APPROVED" ? "success" : item.status === "PENDING_APPROVAL" ? "warning" : item.status === "REJECTED" ? "danger" : "neutral"}>{item.status}</StatusBadge></td></tr>)}</tbody></table></div>}</section>
      </div>
    </AppShell>
  );
}